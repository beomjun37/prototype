#!/usr/bin/env node
/*
 * 분석 파이프라인 동작 시험용 합성 데이터 생성기 (실제 응답이 아님)
 * 실행: node yumin/validation/make-demo.js
 * 출력: yumin/validation/demo-responses.csv, demo-report.md
 *
 * 가상 페르소나 100명이 (1) 우리 테스트 A안(먼저 3표)과 (2) IPIP 20문항에 답했다고 가정해서 CSV를 만들고
 * analyze.js를 돌려 본다. 영역 응답은 "축 성향이 영역 성향과 이 정도 관련된다"는 제 가정에서 나온 값이라,
 * 상관 수치 자체는 아무것도 증명하지 않는다. 오직 입력 형식과 계산이 맞는지 확인하는 용도다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { encId } = require('./analyze.js');
const personas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'personas', 'personas.json'), 'utf8')).personas;
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'mini20-ko.json'), 'utf8')).items;

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
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
// 영역과 축의 대응과 부호 (analyze.js의 EXPECT와 같은 가정)
const DOMAIN_OF_AXIS = { 0: [1, +1], 1: [5, -1], 2: [2, -1], 3: [3, +1], 4: [4, +1] };

const header = ['id', 'result'].concat(meta.map(m => 'i' + m.no));
const lines = [header.join(',')];
personas.forEach((p, pi) => {
  const r = rng(pi * 977 + 5);
  // 우리 테스트: 먼저 3표 규칙으로 축별 점수(0~5) 환산
  const sc = [], first = [];
  for (let a = 0; a < 5; a++) {
    const prefFirst = FIRST.indexOf(p.axes[a].pole) >= 0;
    let pr = prefFirst ? p.axes[a].strength : 1 - p.axes[a].strength;
    if (a >= 3 && p.desirability) pr = pr + p.desirability * (1 - pr);
    if (p.carelessness) pr = pr * (1 - p.carelessness) + 0.5 * p.carelessness;
    let A = 0, B = 0; while (A < 3 && B < 3) { if (r() < pr) A++; else B++; }
    sc.push(A >= 3 ? 5 - B : A); first.push(A >= 3);
  }
  const code = first.slice(0, 4).map((f, i) => (f ? ['B', 'R', 'W', 'D'][i] : ['Q', 'V', 'H', 'L'][i])).join('');
  const link = 'https://example.invalid/#r=' + encId(code, first[4] ? 'C' : 'N', sc, 0);
  // 설문: 각 영역의 잠재 성향 = 축 성향 (-1~+1) x 부호 + 개인차
  const latent = {};
  for (let a = 0; a < 5; a++) {
    const t = (FIRST.indexOf(p.axes[a].pole) >= 0 ? 1 : -1) * (p.axes[a].strength - 0.5) * 2;
    const [d, sg] = DOMAIN_OF_AXIS[a]; latent[d] = sg * t * 0.8 + gauss(r) * 0.5;
  }
  const row = [p.id, link];
  meta.forEach(m => {
    let x = 3 + 1.4 * latent[m.domain] * (m.key === '-' ? -1 : 1) + gauss(r) * 0.9;
    row.push(Math.max(1, Math.min(5, Math.round(x))));
  });
  lines.push(row.join(','));
});
fs.writeFileSync(path.join(__dirname, 'demo-responses.csv'), lines.join('\n') + '\n');
const out = execFileSync('node', [path.join(__dirname, 'analyze.js'), path.join(__dirname, 'demo-responses.csv'), path.join(__dirname, 'demo-report.md')], { encoding: 'utf8' });
// 보고서 맨 위에 합성 데이터임을 밝힌다
const rp = path.join(__dirname, 'demo-report.md');
fs.writeFileSync(rp, '> **합성 데이터로 만든 시험 보고서입니다. 실제 응답이 아니며, 상관 수치는 아무것도 증명하지 않습니다.** 입력 형식과 계산이 동작하는지 확인하는 용도입니다.\n\n' + fs.readFileSync(rp, 'utf8'));
console.log(out);
