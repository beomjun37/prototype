#!/usr/bin/env node
/*
 * office-type 문구 검수기 (샘플 · 초안)
 *
 * 사용: node tools/copy-lint.js [office-type/index.html 경로]
 *
 * 하는 일: index.html 안의 결과 문구 사전(T, X, Y, PP, SCENE ...)을 읽어서
 *   1) 완전히 같은 문장이 둘 이상인지
 *   2) 같은 16유형의 침착(C)/신중(N) 쌍이 얼마나 같은 문장을 받는지
 *   3) 한 카테고리 안에서 문장 첫머리가 반복되는지
 *   4) 문장 길이가 너무 균일한지(리듬)
 *   5) 금지·제한 표현이 얼마나 쓰였는지
 * 를 재고 PASS/FAIL로 알려줍니다. 하나라도 FAIL이면 종료 코드 1.
 *
 * 아래 CFG의 기준값은 초안이며 팀 합의 후 바꿔 쓰세요.
 * 한계: 문장이 화면에서 어떻게 조립되는지(showResult)는 따라가지 않고,
 *       "그 유형에 적용될 수 있는 모든 문장"을 대상으로 잽니다.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'office-type', 'index.html');

const CFG = {
  siblingMax: 0.30,          // 같은 16유형 C/N 쌍의 평균 문장 일치율 상한
  prefixMax: 3,              // 한 카테고리 안에서 같은 첫 4글자를 쓸 수 있는 횟수
  rhythmMinSentences: 8,     // 이 개수 이상인 카테고리만 리듬 검사
  rhythmSkip: ['PRE_C', 'KW', 'SIDE', 'AWQ', 'AW5'], // 라벨·키워드처럼 원래 짧고 균일한 칸은 리듬 검사 제외
  dupMinLength: 8,           // 이보다 짧은 조각("괜찮을까요?" 등)은 같은 문장 검사에서 제외
  rhythmSdMin: 8,            // 카테고리 문장 길이 표준편차 하한
  phrases: [                 // [표현(정규식), 허용 횟수, 설명]
    [/혼자만의 시간/, 0, '당연한 말'],
    [/필요가 있/, 0, '보고서 말투'],
    [/중요(해요|합니다)/, 0, '일반론'],
    [/편이에요/, 10, '"~편이에요" 남발'],
    [/사람이에요/, 5, '"~사람이에요" 남발'],
    [/쪽이에요/, 5, '"~쪽이에요" 남발'],
  ],
};

// 결과 화면에 쓰이는 문구 사전(키 글자로 유형이 정해지는 것만)
const VARS = ['T','X','Y','N32','STING','TALK','PRE_C','KW','SCENE','YEARQ','PP','COLD','SOFT','STRONG',
  'AW','AW5','HL','DEPT','ORG','MOOD','ORGM','YEAR_BX','YEAR_B','YEAR_DX','YEAR_D','SIDE','AWQ'];

// ---- index.html 에서 var NAME={...} / [...] 를 꺼내기 ----
const src = fs.readFileSync(FILE, 'utf8');
const start = src.indexOf('<script>\n/* 축');
if (start < 0) { console.error('index.html 구조를 찾지 못했어요: <script> 시작 표식이 없어요.'); process.exit(2); }
const body = src.slice(start);
const data = {};
const re = /\nvar ([A-Za-z_0-9]+) *= */g;
let m;
while ((m = re.exec(body))) {
  const name = m[1];
  if (!VARS.includes(name)) continue;
  let i = m.index + m[0].length;
  if (body[i] !== '{' && body[i] !== '[') continue;
  let depth = 0, j = i, str = null, esc = false;
  for (; j < body.length; j++) {
    const ch = body[j];
    if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === str) str = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { j++; break; } }
  }
  try { data[name] = vm.runInNewContext('(' + body.slice(i, j) + ')', {}); }
  catch (e) { console.error('읽기 실패:', name, e.message); }
}

// ---- 문장(leaf) 모으기: 키가 글자 조합이면 그 유형에만 적용 ----
const KEY = /^[BQRVWHDLCN]{1,5}$/;
const leaves = [];
Object.keys(data).forEach(cat => {
  (function walk(v, keyAcc, idx) {
    if (typeof v === 'string') {
      if (keyAcc && /[가-힣]/.test(v) && !v.startsWith('#')) leaves.push({ cat, key: keyAcc, text: v, slot: idx });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, keyAcc, idx + '[' + i + ']'));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const ok = KEY.test(k) && new Set(k).size === k.length;
        walk(x, ok ? (keyAcc || '') + k : keyAcc, idx + '.' + k);
      }
    }
  })(data[cat], '', cat);
});

const AX = [['B','Q'],['R','V'],['W','H'],['D','L'],['C','N']];
const types = [];
for (const a of AX[0]) for (const b of AX[1]) for (const c of AX[2]) for (const d of AX[3]) for (const e of AX[4]) types.push(a+b+c+d+e);
const applies = (l, t) => [...l.key].every(ch => t.includes(ch));
const sentences = text => text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(s => s.length > 3);

const results = [];
const add = (name, pass, detail, notes) => results.push({ name, pass, detail, notes: notes || [] });

// 1) 완전히 같은 문장
{
  const seen = {};
  leaves.forEach(l => sentences(l.text).forEach(s => { if (s.length >= CFG.dupMinLength) (seen[s] = seen[s] || new Set()).add(l.cat + ' ' + l.slot); }));
  const dups = Object.entries(seen).filter(([, v]) => v.size > 1);
  add('완전히 같은 문장', dups.length === 0, dups.length + '개 (기준 0개)',
    dups.slice(0, 5).map(([s, v]) => '"' + s.slice(0, 36) + (s.length > 36 ? '…' : '') + '"  ← ' + [...v].slice(0, 3).join(', ')));
}

// 2) 같은 16유형의 침착/신중 쌍 일치율
{
  const sib = [];
  for (let i = 0; i < 32; i += 2) {
    const A = new Set(), B = new Set();
    leaves.forEach(l => { const id = l.cat + '|' + l.slot + '|' + l.text; if (applies(l, types[i])) A.add(id); if (applies(l, types[i + 1])) B.add(id); });
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    sib.push({ code: types[i].slice(0, 4), jac: inter / (A.size + B.size - inter) });
  }
  const avg = sib.reduce((a, b) => a + b.jac, 0) / sib.length;
  sib.sort((a, b) => b.jac - a.jac);
  add('C/N 쌍 문장 일치율(평균)', avg <= CFG.siblingMax, (avg * 100).toFixed(0) + '% (기준 ' + CFG.siblingMax * 100 + '% 이하)',
    ['가장 높은 3쌍: ' + sib.slice(0, 3).map(x => x.code + ' ' + (x.jac * 100).toFixed(0) + '%').join(', ')]);
}

// 3) 카테고리 안 첫머리 반복
{
  const bad = [];
  const byCat = {};
  leaves.forEach(l => sentences(l.text).forEach(s => { (byCat[l.cat] = byCat[l.cat] || []).push(s); }));
  Object.entries(byCat).forEach(([cat, ss]) => {
    const c = {}; ss.forEach(s => { const k = s.slice(0, 4); c[k] = (c[k] || 0) + 1; });
    Object.entries(c).forEach(([k, n]) => { if (n > CFG.prefixMax && /[가-힣]/.test(k)) bad.push([cat, k, n]); });
  });
  bad.sort((a, b) => b[2] - a[2]);
  add('같은 카테고리 첫머리 반복', bad.length === 0, bad.length + '건 (기준: 같은 첫 4글자 ' + CFG.prefixMax + '회 이하)',
    bad.slice(0, 5).map(([cat, k, n]) => cat + ': "' + k + '…" ' + n + '회'));
}

// 4) 문장 길이 리듬
{
  const bad = [];
  const byCat = {};
  leaves.forEach(l => sentences(l.text).forEach(s => { (byCat[l.cat] = byCat[l.cat] || []).push(s.length); }));
  Object.entries(byCat).forEach(([cat, ls]) => {
    if (ls.length < CFG.rhythmMinSentences || CFG.rhythmSkip.includes(cat)) return;
    const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
    const sd = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length);
    if (sd < CFG.rhythmSdMin) bad.push([cat, sd, mean, ls.length]);
  });
  bad.sort((a, b) => a[1] - b[1]);
  add('문장 길이 리듬(너무 균일)', bad.length === 0, bad.length + '개 카테고리 (기준: 표준편차 ' + CFG.rhythmSdMin + ' 이상)',
    bad.slice(0, 5).map(([cat, sd, mean, n]) => cat + ': 표준편차 ' + sd.toFixed(1) + ', 평균 ' + mean.toFixed(0) + '자, ' + n + '문장'));
}

// 5) 금지·제한 표현
{
  const all = leaves.flatMap(l => sentences(l.text));
  const over = [];
  CFG.phrases.forEach(([r, max, why]) => {
    const n = all.filter(s => r.test(s)).length;
    if (n > max) over.push(r.source + ' ' + n + '회 (허용 ' + max + ', ' + why + ')');
  });
  add('금지·제한 표현', over.length === 0, over.length + '개 표현이 기준 초과', over);
}

// ---- 출력 ----
console.log('office-type 문구 검수 (' + path.relative(process.cwd(), FILE) + ')');
console.log('검사 대상: 문장 ' + leaves.length + '개 / 유형 32개\n');
results.forEach(r => {
  console.log((r.pass ? '[PASS] ' : '[FAIL] ') + r.name + ' — ' + r.detail);
  r.notes.forEach(n => console.log('         · ' + n));
});
const failed = results.filter(r => !r.pass).length;
console.log('\n결과: ' + (results.length - failed) + '/' + results.length + ' 통과');
process.exit(failed ? 1 : 0);
