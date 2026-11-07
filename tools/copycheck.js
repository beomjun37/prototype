#!/usr/bin/env node
/*
 * copycheck.js — 프로토 화면 문구 전수 점검 (LCP TF)
 *
 * 쓰는 법:
 *   node copycheck.js 파일.html                 # 기본 금지어로 검사
 *   node copycheck.js 파일.html --ban "단어1,단어2"   # 금지어 추가
 *   node copycheck.js 파일.html --dark          # 다크 모드로 검사
 *
 * 하는 일:
 *   1) 시작 화면, 질문 화면, 결과 화면을 실제로 띄워서 화면에 보이는 글자만 모은다.
 *      (오피스 캐릭터 테스트처럼 #r=코드 결과 주소를 쓰는 페이지는 가능한 결과를 전부 띄운다)
 *   2) 결과마다 궁합 선택지를 전부 바꿔 가며 궁합 화면 글자도 모은다.
 *   3) 금지어, 깨진 값(undefined, NaN, null, [object), 조사 오류(받침 뒤 '와/는/를' 등),
 *      12px 미만 글자, 가로 넘침, 빈 이미지를 찾는다.
 * 개발자용 화면(#dev)은 MBTI 같은 내부 용어가 원래 나오므로 검사에서 뺀다.
 */
const { chromium } = require('playwright');
const path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('사용법: node copycheck.js 파일.html [--ban "a,b"] [--dark]'); process.exit(2); }
const dark = args.includes('--dark');
const banIdx = args.indexOf('--ban');
const BAN_DEFAULT = ['MBTI', '엠비티아이', '덤덤한 편', '걱정 많은 편', '걱정 모드', '태연', '모드)', '32명', '32가지', '32유형', '16명', '16가지', '-A', '-T', '삼킨 말', '결재'];
const BAN = BAN_DEFAULT.concat(banIdx >= 0 ? args[banIdx + 1].split(',').map(s => s.trim()).filter(Boolean) : []);
const BROKEN = ['undefined', 'NaN', 'null', '[object', '{{', '}}'];

function hasBatchim(ch) { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0; }
function josaErrors(text) {
  // 동사 어미(듣는, 있는)와 헷갈리지 않는 조사만 본다: 와/과, 을/를, 예요/이에요
  const out = [];
  const re = /([가-힣])(와|과|를|을|예요|이에요)(?=[\s,.!?"'”’)]|$)/g; let m;
  while ((m = re.exec(text))) {
    const b = hasBatchim(m[1]), j = m[2];
    const wrong = (b && (j === '와' || j === '를' || j === '예요')) || (!b && (j === '과' || j === '을' || j === '이에요'));
    if (wrong) out.push(text.slice(Math.max(0, m.index - 8), m.index + 6).replace(/\s+/g, ' '));
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: dark ? 'dark' : 'light' });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const url = 'file://' + path.resolve(file);
  const found = new Map(); // 문제 → 어디서
  function add(kind, detail, where) { const k = kind + ' | ' + detail; if (!found.has(k)) found.set(k, where); }

  async function scan(where) {
    const r = await page.evaluate(() => {
      const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
      const dev = document.getElementById('dev');
      const text = [...document.querySelectorAll('body *')].filter(el => vis(el) && !(dev && dev.contains(el)) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim());
      const opts = [...document.querySelectorAll('select option')].filter(o => o.closest('section') && !o.closest('section').hidden).map(o => o.textContent);
      const small = [...document.querySelectorAll('body *')].filter(el => vis(el) && !(dev && dev.contains(el)) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) > 0 && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 30));
      const imgs = [...document.querySelectorAll('img')].filter(i => vis(i) && !(dev && dev.contains(i)) && (!i.getAttribute('src') || i.naturalWidth === 0)).length;
      const over = document.documentElement.scrollWidth > window.innerWidth + 1;
      return { text: text.concat(opts), small, imgs, over };
    });
    const all = r.text.join('\n');
    BAN.forEach(w => { if (all.includes(w)) { const line = r.text.find(t => t.includes(w)); add('금지어', `"${w}" ← ${line.slice(0, 50)}`, where); } });
    BROKEN.forEach(w => { if (all.includes(w)) add('깨진 값', w, where); });
    r.text.forEach(t => josaErrors(t).forEach(c => add('조사 확인', c, where)));
    r.small.forEach(t => add('12px 미만 글자', t, where));
    if (r.imgs) add('빈 이미지', r.imgs + '개', where);
    if (r.over) add('가로 넘침', '화면보다 넓음', where);
  }

  await page.goto(url); await page.waitForTimeout(400); await scan('시작 화면');
  // 질문 화면: 첫 질문과 끝까지
  if (await page.$('#start')) {
    await page.click('#start');
    for (let i = 0; i < 40; i++) { if (!(await page.$('#quiz:not([hidden]) .opt'))) break; await scan('질문 화면'); await page.click('.opt >> nth=' + (i % 2)); }
    await scan('결과 화면(직접 풀이)');
  }
  // 결과 주소가 있는 페이지면 가능한 결과를 모두 띄움
  const codes = await page.evaluate(() => (typeof T === 'object' && typeof AX === 'object') ? Object.keys(T) : []);
  let n = 0;
  for (const c of codes) for (const m of ['C', 'N']) {
    const sc = [0, 1, 2, 3].map(i => (c[i] === ['B', 'R', 'W', 'D'][i] ? 3 : 0)).concat([m === 'C' ? 3 : 0]).join('');
    await page.goto('about:blank'); await page.goto(url + `#r=${c}-${m}&s=${sc}&w=0`); await page.waitForTimeout(80);
    if (n === 0) await scan(`친구 링크 화면 ${c}-${m}`);
    await page.evaluate(() => { if (typeof setFriendView === 'function') setFriendView(null); });
    await page.evaluate(() => document.querySelectorAll('.it .itb').forEach(d => d.hidden = false));
    await scan(`결과 ${c}-${m}`); n++;
    const vals = await page.$$eval('#gSel option', os => os.map(o => o.value));
    for (const v of vals) { await page.evaluate(v => { const s = document.getElementById('gSel'); s.value = v; s.onchange && s.onchange(); }, v); await scan(`결과 ${c}-${m} 궁합 ${v}`); }
  }
  await browser.close();

  console.log(`# 문구 점검: ${path.basename(file)}${dark ? ' (다크)' : ''}  — 결과 ${n}개 확인`);
  if (errs.length) console.log('\n## 스크립트 오류\n' + [...new Set(errs)].map(e => '- ' + e).join('\n'));
  const groups = {};
  for (const [k, where] of found) { const [kind, detail] = k.split(' | '); (groups[kind] = groups[kind] || []).push(`- ${detail}  (${where})`); }
  const kinds = Object.keys(groups);
  if (!kinds.length && !errs.length) { console.log('\n문제 없음. (증거일 뿐 증명은 아니에요. 실제 폰으로 한 번 보세요.)'); process.exit(0); }
  kinds.forEach(k => { console.log(`\n## ${k} (${groups[k].length})`); console.log(groups[k].slice(0, 40).join('\n')); });
  process.exit(groups['금지어'] || groups['깨진 값'] || errs.length ? 1 : 0);
})();
