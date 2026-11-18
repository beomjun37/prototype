#!/usr/bin/env node
/*
 * 판정 설계 비교 시뮬레이션 (브라우저 없이 계산만, 페르소나 100명 x 반복)
 * 실행: node yumin/personas/design-sim.js [반복 횟수, 기본 300]
 *
 * 같은 응답 모델(make-personas.js 주석 참고)로 여러 판정 설계를 비교한다.
 * 한 축에는 질문이 최대 7개(기본 5 + 추가 2) 있다고 가정한다.
 * 응답 모델은 가정이므로 절대값이 아니라 설계 간 상대 비교로만 본다.
 */
const fs = require('fs');
const path = require('path');
const personas = JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8')).personas;
const REP = parseInt(process.argv[2] || '300', 10);
const CAP = 7;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FIRST = ['B', 'R', 'W', 'D', 'C'];
function p0(persona, axis, delta) {
  const a = persona.axes[axis];
  let s = Math.min(0.97, a.strength + (delta || 0));        // 문항 품질이 좋아지면 구분력이 오른다는 가정
  let p = FIRST.indexOf(a.pole) >= 0 ? s : 1 - s;
  if (axis >= 3 && persona.desirability) p = p + persona.desirability * (1 - p);
  if (persona.carelessness) p = p * (1 - persona.carelessness) + 0.5 * persona.carelessness;
  return p;
}

// 각 설계는 (ask(axis) 함수, 난수) -> {pole: [0/1 x5], q, margin: [x5]}
const DESIGNS = {};
function perAxis(stop) {
  return function (ask, rand) {
    const out = [], margin = []; let q = 0;
    for (let a = 0; a < 5; a++) {
      let A = 0, B = 0;
      while (!stop(A, B) && A + B < CAP) { if (ask(a)) A++; else B++; q++; }
      out.push(A > B ? 0 : A < B ? 1 : (rand() < 0.5 ? 0 : 1)); margin.push(Math.abs(A - B));
    }
    return { pole: out, q, margin };
  };
}
// 한 극이 3표를 먼저 얻으면 종료(A안)
DESIGNS['A안: 먼저 3표'] = perAxis((A, B) => A >= 3 || B >= 3);
// 표 차이가 m 이상이면 종료 (순차 검정과 같은 꼴), 축당 최대 cap
function lead(m, cap) { return function (ask, rand) { const f = perAxis((A, B) => Math.abs(A - B) >= m || A + B >= cap); return f(ask, rand); }; }
DESIGNS['표 차이 2 이상, 최대 5'] = lead(2, 5);
DESIGNS['표 차이 2 이상, 최대 7'] = lead(2, 7);
DESIGNS['표 차이 3 이상, 최대 7'] = lead(3, 7);
// 전체 질문 예산을 가장 애매한 축에 몰아서 쓴다: 축마다 2개씩 먼저 묻고, 남은 예산은 표 차이가 가장 작은 축에
function budget(B0) {
  return function (ask, rand) {
    const A = [0, 0, 0, 0, 0], N = [0, 0, 0, 0, 0]; let q = 0;
    const one = a => { if (ask(a)) A[a]++; N[a]++; q++; };
    for (let a = 0; a < 5; a++) { one(a); one(a); }
    while (q < B0) {
      let best = -1, bm = 99;
      for (let a = 0; a < 5; a++) {
        if (N[a] >= CAP) continue;
        const m = Math.abs(2 * A[a] - N[a]) + rand() * 0.1;
        if (m < bm) { bm = m; best = a; }
      }
      if (best < 0) break;
      one(best);
    }
    for (let a = 0; a < 5; a++) while (2 * A[a] === N[a] && N[a] < CAP) one(a);   // 동점은 한 문항 더
    return { pole: A.map((x, a) => (2 * x > N[a] ? 0 : 2 * x < N[a] ? 1 : (rand() < 0.5 ? 0 : 1))), q, margin: A.map((x, a) => Math.abs(2 * x - N[a])) };
  };
}
[14, 16, 18, 20, 22, 24].forEach(b => { DESIGNS['예산 배분: 평균 약 ' + b + '문항 상한'] = budget(b); });
// C안: A안 + 3:2로 끝난 축에 추가 질문 2개 (7표 다수결)
DESIGNS['C안: A안 + 3:2 축 추가 2문항'] = function (ask, rand) {
  const out = [], margin = []; let q = 0;
  for (let a = 0; a < 5; a++) {
    let A = 0, B = 0;
    while (A < 3 && B < 3) { if (ask(a)) A++; else B++; q++; }
    if (Math.min(A, B) === 2) for (let i = 0; i < 2; i++) { if (ask(a)) A++; else B++; q++; }
    out.push(A > B ? 0 : 1); margin.push(Math.abs(A - B));
  }
  return { pole: out, q, margin };
};
// 원본: 5문항 + 갈린 축(최대 3개)에 추가 2문항
DESIGNS['원본: 5문항 + 추가 질문'] = function (ask, rand) {
  const sc = [0, 0, 0, 0, 0]; let q = 25;
  for (let a = 0; a < 5; a++) for (let i = 0; i < 5; i++) if (ask(a)) sc[a]++;
  const amb = [0, 1, 2, 3, 4].filter(a => sc[a] === 2 || sc[a] === 3).slice(0, 3);
  const out = [], margin = [];
  for (let a = 0; a < 5; a++) {
    if (amb.indexOf(a) >= 0) { let x = 0; for (let i = 0; i < 2; i++) if (ask(a)) x++; q += 2; out.push(sc[a] + x >= 4 ? 0 : 1); margin.push(Math.abs(2 * (sc[a] + x) - 7)); }
    else { out.push(sc[a] >= 3 ? 0 : 1); margin.push(Math.abs(2 * sc[a] - 5)); }
  }
  return { pole: out, q, margin };
};

function evaluate(design, delta) {
  let N = 0, q = 0, exact = 0, axisHit = 0, retestSame = 0, retestN = 0, lowMargin = 0;
  personas.forEach((p, pi) => {
    const truth = [0, 1, 2, 3, 4].map(a => (FIRST.indexOf(p.axes[a].pole) >= 0 ? 0 : 1));
    for (let r = 0; r < REP; r++) {
      const outs = [0, 1].map(k => { const rand = rng(pi * 1000003 + r * 7919 + k * 15485863 + 11); return design(a => rand() < p0(p, a, delta), rand); });
      outs.forEach(o => {
        N++; q += o.q;
        const hit = o.pole.filter((v, a) => v === truth[a]).length;
        axisHit += hit; if (hit === 5) exact++;
        lowMargin += o.margin.filter(m => m <= 1).length;
      });
      retestN++; if (outs[0].pole.join('') === outs[1].pole.join('')) retestSame++;
    }
  });
  return { q: q / N, exact: exact / N * 100, axis: axisHit / (N * 5) * 100, retest: retestSame / retestN * 100, low: lowMargin / N };
}
const f1 = x => x.toFixed(1);
const rows = [];
for (const [name, d] of Object.entries(DESIGNS)) { const r = evaluate(d, 0); rows.push([name, r]); }
console.log('| 설계 | 평균 질문 | 유형 일치 | 축별 일치 | 재현 | 마진 1 이하 축 수 |');
console.log('| --- | --- | --- | --- | --- | --- |');
rows.forEach(([n, r]) => console.log(`| ${n} | ${f1(r.q)} | ${f1(r.exact)}% | ${f1(r.axis)}% | ${f1(r.retest)}% | ${r.low.toFixed(2)} |`));
console.log('\n문항 품질 민감도 (A안, 모든 축의 구분력 +delta)');
console.log('| delta | 평균 질문 | 유형 일치 | 재현 |');
console.log('| --- | --- | --- | --- |');
[0, 0.03, 0.05, 0.08, 0.1].forEach(dl => { const r = evaluate(DESIGNS['A안: 먼저 3표'], dl); console.log(`| +${dl} | ${f1(r.q)} | ${f1(r.exact)}% | ${f1(r.retest)}% |`); });

// 세부 분포: node yumin/personas/design-sim.js 150 dist
if (process.argv[3] === 'dist') {
  const pick = ['A안: 먼저 3표', '표 차이 2 이상, 최대 7', '표 차이 3 이상, 최대 7', 'C안: A안 + 3:2 축 추가 2문항'];
  console.log('\n질문 수 분포와 프로필별 유형 일치');
  console.log('| 설계 | 평균 | 중앙값 | 90% 이하 | 최대 | 뚜렷형 | 보통형 | 애매형 | 전축 애매형 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  pick.forEach(name => {
    const d = DESIGNS[name], qs = [], prof = {};
    personas.forEach((p, pi) => {
      const truth = [0, 1, 2, 3, 4].map(a => (FIRST.indexOf(p.axes[a].pole) >= 0 ? 0 : 1));
      for (let r = 0; r < REP; r++) {
        const rand = rng(pi * 1000003 + r * 7919 + 11);
        const o = d(a => rand() < p0(p, a, 0), rand);
        qs.push(o.q);
        const k = p.profile; prof[k] = prof[k] || [0, 0];
        prof[k][1]++; if (o.pole.every((v, a) => v === truth[a])) prof[k][0]++;
      }
    });
    qs.sort((a, b) => a - b);
    const P = x => qs[Math.floor(qs.length * x)];
    const pc = k => (prof[k][0] / prof[k][1] * 100).toFixed(0) + '%';
    console.log(`| ${name} | ${(qs.reduce((a, b) => a + b, 0) / qs.length).toFixed(1)} | ${P(0.5)} | ${P(0.9)} | ${qs[qs.length - 1]} | ${pc('뚜렷형')} | ${pc('보통형')} | ${pc('애매형')} | ${pc('전축 애매형')} |`);
  });
}
