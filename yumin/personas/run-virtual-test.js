#!/usr/bin/env node
/*
 * 가상 페르소나 100명으로 office-type v2를 실제 브라우저에서 돌리는 시험 러너
 *
 * 준비: 저장소 루트에서 `python3 -m http.server 8765` 를 띄워 둔다.
 * 실행: node yumin/personas/run-virtual-test.js [페이지 주소] [출력 폴더]
 *
 * 페르소나마다 2번 응답해서 (1) 질문 수, (2) 결과가 의도한 유형과 같은지,
 * (3) 두 번 해도 같은 유형인지(재현), (4) 경계 축 개수와 경계 해설 노출을 잰다.
 * 비교용으로 같은 페르소나를 원본 알고리즘(25문항 + 갈린 축 추가 질문)에 계산상으로도 돌린다.
 * 응답 모델은 make-personas.js 주석 참고. 실제 사람의 응답이 아니라 가정이다.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8765/yumin/office-type-v2/index.html';
const OUT = process.argv[3] || path.join(__dirname, '..', 'office-type-v2');
const personas = JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8')).personas;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 문항 하나에서 첫째 극(0)을 고를 확률
function p0(persona, axis) {
  const a = persona.axes[axis];
  const prefersFirst = (['B', 'R', 'W', 'D', 'C'].indexOf(a.pole) >= 0);
  let p = prefersFirst ? a.strength : 1 - a.strength;
  if (axis >= 3 && persona.desirability) p = p + persona.desirability * (1 - p); // 좋아 보이는 첫째 극으로 쏠림
  if (persona.carelessness) p = p * (1 - persona.carelessness) + 0.5 * persona.carelessness;
  return p;
}
const LET = [['B', 'Q'], ['R', 'V'], ['W', 'H'], ['D', 'L'], ['C', 'N']];

// ---- 원본 알고리즘 계산(브라우저 없이) ----
function simOriginal(persona, rand) {
  const sc = [0, 0, 0, 0, 0];
  for (let a = 0; a < 5; a++) for (let i = 0; i < 5; i++) if (rand() < p0(persona, a)) sc[a]++;
  const amb = [];
  for (let a = 0; a < 5; a++) if (sc[a] === 2 || sc[a] === 3) amb.push(a);
  const ext = amb.slice(0, 3);
  const lab = [];
  for (let a = 0; a < 5; a++) {
    let first;
    if (ext.indexOf(a) >= 0) { let xa = 0; for (let i = 0; i < 2; i++) if (rand() < p0(persona, a)) xa++; first = sc[a] + xa >= 4; }
    else first = sc[a] >= 3;
    lab.push(first ? LET[a][0] : LET[a][1]);
  }
  return { code: lab.join(''), q: 25 + 2 * ext.length };
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (let pi = 0; pi < personas.length; pi++) {
    const persona = personas[pi];
    const runs = [];
    for (let r = 0; r < 2; r++) {
      const rand = rng(pi * 7919 + r * 104729 + 17);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(URL);
      await page.click('#start');
      let guard = 0;
      while (await page.isVisible('#quiz') && guard++ < 40) {
        const info = await page.evaluate(() => {
          const qi = nextQ();
          return qi < 0 ? null : { qi, axis: Q[qi][0], labels: Q[qi][2].map(o => o.split('|')[0]) };
        });
        if (!info) break;
        const k = rand() < p0(persona, info.axis) ? 0 : 1;
        const btns = await page.$$('#opts .opt');
        let idx = -1;
        for (let b = 0; b < btns.length; b++) { const t = await btns[b].$eval('b', e => e.textContent); if (t === info.labels[k]) { idx = b; break; } }
        if (idx < 0) throw new Error('선택지를 찾지 못함 ' + persona.id);
        await btns[idx].click();
        await page.waitForTimeout(8);
      }
      await page.waitForSelector('#result:not([hidden])', { timeout: 5000 });
      const res = await page.evaluate(() => ({
        code: LAST.code, mood: LAST.mood, q: st.i,
        sc: st.sc.slice(),
        boundaryItem: Array.from(document.querySelectorAll('#rList .it b')).some(e => e.textContent === '한쪽으로 단정하기 어려운 부분')
      }));
      res.bd = res.sc.filter(v => v === 2 || v === 3).length;
      res.full = res.code + res.mood;
      const orig = simOriginal(persona, rng(pi * 31337 + r * 7 + 3));
      res.orig = orig;
      runs.push(res);
      await ctx.close();
    }
    rows.push({ id: persona.id, profile: persona.profile, trueType: persona.trueType, runs });
    if ((pi + 1) % 10 === 0) console.log('진행', pi + 1, '/', personas.length);
  }
  await browser.close();

  // ---- 집계 ----
  const pct = (a, b) => (b ? (a / b * 100).toFixed(0) + '%' : '-');
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  const all = rows.flatMap(r => r.runs.map(x => ({ ...x, id: r.id, profile: r.profile, trueType: r.trueType })));
  const v2 = {
    q: avg(all.map(x => x.q)),
    exact: all.filter(x => x.full === x.trueType).length,
    axisHit: all.reduce((s, x) => s + [0, 1, 2, 3, 4].filter(i => x.full[i] === x.trueType[i]).length, 0),
    retest: rows.filter(r => r.runs[0].full === r.runs[1].full).length
  };
  const og = {
    q: avg(all.map(x => x.orig.q)),
    exact: all.filter(x => x.orig.code === x.trueType).length,
    axisHit: all.reduce((s, x) => s + [0, 1, 2, 3, 4].filter(i => x.orig.code[i] === x.trueType[i]).length, 0),
    retest: rows.filter(r => r.runs[0].orig.code === r.runs[1].orig.code).length
  };
  const profiles = ['뚜렷형', '보통형', '애매형', '전축 애매형'];
  const byProfile = profiles.map(p => {
    const s = all.filter(x => x.profile === p);
    const rs = rows.filter(r => r.profile === p);
    return {
      p, n: s.length, q: avg(s.map(x => x.q)),
      exact: pct(s.filter(x => x.full === x.trueType).length, s.length),
      axis: pct(s.reduce((a, x) => a + [0, 1, 2, 3, 4].filter(i => x.full[i] === x.trueType[i]).length, 0), s.length * 5),
      retest: pct(rs.filter(r => r.runs[0].full === r.runs[1].full).length, rs.length),
      bd: avg(s.map(x => x.bd)), shown: pct(s.filter(x => x.boundaryItem).length, s.length),
      origExact: pct(s.filter(x => x.orig.code === x.trueType).length, s.length)
    };
  });
  const bdDist = [0, 1, 2, 3, 4, 5].map(k => all.filter(x => x.bd === k).length);
  const wrongAxis = [0, 0, 0, 0, 0];
  all.forEach(x => [0, 1, 2, 3, 4].forEach(i => { if (x.full[i] !== x.trueType[i]) wrongAxis[i]++; }));
  const AX = ['충전', '일을 보는 눈', '기준', '마감 리듬', '멘탈'];
  const qs = all.map(x => x.q).sort((a, b) => a - b);

  const md = [];
  md.push('# office-type v2 가상 테스트 (페르소나 100명 x 2회 = 200회)', '',
    '실행: `node yumin/personas/run-virtual-test.js` (실제 브라우저에서 v2 페이지를 조작). 응답 모델은 가정이며, 실제 사람의 응답과 다를 수 있습니다. 원본 알고리즘은 같은 페르소나를 계산상으로 돌린 값입니다.', '',
    '## 전체 비교', '',
    '| 지표 | 원본 (25문항 + 추가 질문) | v2 (5문항 조기 종료) |', '| --- | --- | --- |',
    `| 평균 질문 수 | ${og.q} | ${v2.q} (최소 ${qs[0]}, 최대 ${qs[qs.length - 1]}) |`,
    `| 의도한 유형과 정확히 일치 | ${pct(og.exact, all.length)} | ${pct(v2.exact, all.length)} |`,
    `| 축별 일치 | ${pct(og.axisHit, all.length * 5)} | ${pct(v2.axisHit, all.length * 5)} |`,
    `| 두 번 해도 같은 유형 (재현) | ${pct(og.retest, rows.length)} | ${pct(v2.retest, rows.length)} |`, '',
    '## 프로필별 (v2)', '',
    '| 프로필 | 횟수 | 평균 질문 | 유형 일치 | 축별 일치 | 재현 | 평균 경계 축 | 경계 해설 노출 | (참고) 원본 유형 일치 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...byProfile.map(b => `| ${b.p} | ${b.n} | ${b.q} | ${b.exact} | ${b.axis} | ${b.retest} | ${b.bd} | ${b.shown} | ${b.origExact} |`), '',
    '## 경계 축 개수 분포 (v2, 200회)', '',
    '| 경계 축 수 | ' + [0, 1, 2, 3, 4, 5].join(' | ') + ' |', '| --- | ' + [0, 1, 2, 3, 4, 5].map(() => '---').join(' | ') + ' |',
    '| 횟수 | ' + bdDist.join(' | ') + ' |', '',
    `경계 해설 노출(경계 축 2개 이상): ${pct(all.filter(x => x.boundaryItem).length, all.length)} (${all.filter(x => x.boundaryItem).length}/${all.length})`, '',
    '## 축별 오답 (v2, 200회 중)', '',
    '| 축 | ' + AX.join(' | ') + ' |', '| --- | ' + AX.map(() => '---').join(' | ') + ' |',
    '| 의도와 다른 극 | ' + wrongAxis.join(' | ') + ' |', '');
  fs.writeFileSync(path.join(OUT, 'virtual-test-100.md'), md.join('\n'));
  fs.writeFileSync(path.join(OUT, 'virtual-test-100.json'), JSON.stringify({ rows }, null, 1));
  console.log(md.join('\n'));
})();
