#!/usr/bin/env node
/*
 * 가상 직장인 페르소나 100명 생성기 (고정 시드, 같은 결과가 다시 나옵니다)
 * 실행: node yumin/personas/make-personas.js
 * 출력: yumin/personas/personas.json, yumin/personas/personas.md
 *
 * 모두 가상 인물이며 실제 사람과 무관합니다. 이름은 흔한 성과 이름을 섞은 가명입니다.
 *
 * 구성: 32유형 x 3명(뚜렷형, 보통형, 애매형) = 96명, 여기에 모든 축이 애매한 4명을 더해 100명.
 * 모든 유형이 같은 비중으로 들어가므로, "결과가 의도한 유형으로 나오는지"를 유형별로 잴 수 있습니다.
 *
 * 응답 모델(시험 러너가 사용): 문항마다 해당 축의 선호 극을 고를 확률은 strength,
 * 반대 극은 1 - strength. 부주의(carelessness) 비율만큼은 아무거나 고르고,
 * desirability 값만큼은 마감 리듬(D)과 멘탈(C) 축에서 "좋아 보이는" 첫째 극 쪽으로 쏠립니다.
 * 이 모델은 가정이며 실제 사람의 응답과 다를 수 있습니다.
 */
const fs = require('fs');
const path = require('path');

// 시드 고정 난수 (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261118);
const pick = arr => arr[Math.floor(R() * arr.length)];
const between = (lo, hi) => lo + (hi - lo) * R();
const r2 = x => Math.round(x * 100) / 100;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const AXES = [
  { n: '충전', l: ['B', 'Q'], p0: '회식 제안이 오면 메뉴부터 찾아보는', p1: '점심은 이어폰 끼고 혼자 먹는 쪽이 편한', mix: '충전 방식이 그날 일정에 따라 달라지는' },
  { n: '일을 보는 눈', l: ['R', 'V'], p0: '새 일은 "그래서 이번 주에 뭘 하죠?"부터 묻는', p1: '새 일은 "이게 왜 필요한 거죠?"부터 묻는', mix: '눈앞의 일과 큰 그림 사이를 오가는' },
  { n: '기준', l: ['W', 'H'], p0: '실수를 보면 뭐가 문제였는지부터 짚는', p1: '실수를 보면 괜찮다고 먼저 말해 주는', mix: '일에 따라 기준과 사람 사정 사이에서 흔들리는' },
  { n: '마감 리듬', l: ['D', 'L'], p0: '마감 일주일 전에 끝내 두는', p1: '마감 날 아침에 몰아서 하는', mix: '일에 따라 미리 하기도 몰아서 하기도 하는' },
  { n: '멘탈', l: ['C', 'N'], p0: '상사의 "잠깐 얘기 좀"에도 별일 아니겠지 하는', p1: '상사의 "잠깐 얘기 좀"에 가는 내내 대본을 쓰는', mix: '그날 컨디션에 따라 걱정이 커졌다 줄었다 하는' }
];
const ROLES = ['개발', '영업', '인사', '재무', '전략기획', '마케팅', '생산·품질', '연구개발', '고객지원', '디자인', '법무', '구매'];
const COMPANY = [['스타트업', 20], ['중견기업', 30], ['대기업', 35], ['공공기관', 15]];
const WORKSTYLE = [['출근', 55], ['하이브리드', 35], ['재택', 10]];
const CONTEXT = ['점심 먹고 남은 15분', '퇴근길 지하철', '회의 시작 전 5분', '단톡방 링크를 눌러서', '야근하다 쉬는 시간'];
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
const GIV = ['지우', '서연', '민준', '하윤', '도윤', '서준', '지민', '수아', '예준', '지호', '하준', '채원', '유진', '현우', '지안', '소율', '태윤', '다은', '시우', '나연', '재윤', '은호', '가람', '보람', '이든', '세아', '로운', '하람', '주원', '아린', '건우', '다현', '승민', '예린', '준서', '윤아', '시현', '소은', '동하', '이레'];
function weighted(list) { const tot = list.reduce((a, b) => a + b[1], 0); let x = R() * tot; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; }

// 이름 100개를 중복 없이
const names = [];
const used = new Set();
while (names.length < 100) { const n = pick(SUR) + pick(GIV); if (!used.has(n)) { used.add(n); names.push(n); } }

const types = [];
for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) for (const d of [0, 1]) for (const e of [0, 1]) types.push([a, b, c, d, e]);
const codeOf = sides => sides.map((s, i) => AXES[i].l[s]).join('');

function strengths(profile) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    if (profile === '뚜렷형') out.push(r2(between(0.82, 0.95)));
    else if (profile === '보통형') out.push(r2(between(0.65, 0.8)));
    else if (profile === '애매형') out.push(r2(i < 3 ? between(0.5, 0.62) : between(0.7, 0.8)));
    else out.push(r2(between(0.5, 0.6))); // 전축 애매형
  }
  return shuffle(out);
}

const specs = [];
for (const t of types) for (const profile of ['뚜렷형', '보통형', '애매형']) specs.push({ sides: t, profile });
for (let i = 0; i < 4; i++) specs.push({ sides: shuffle(types.slice())[0], profile: '전축 애매형' });
shuffle(specs);

const personas = specs.map((sp, idx) => {
  const st = strengths(sp.profile);
  const years = Math.max(1, Math.round(between(1, 20) * (R() < 0.5 ? 0.6 : 1)));
  const title = years <= 3 ? '사원' : years <= 6 ? '대리' : years <= 11 ? '과장' : years <= 16 ? '차장' : '부장';
  const role = pick(ROLES);
  const company = weighted(COMPANY);
  const carelessness = R() < 0.7 ? 0 : (R() < 0.6 ? 0.1 : 0.2);
  const desirability = R() < 0.7 ? 0 : r2(between(0.05, 0.12));
  // 한 줄 소개: 가장 뚜렷한 축 3개는 성향으로, 애매한 축은 "그때그때"로
  const order = st.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const parts = [];
  for (const [v, i] of order) {
    if (parts.length >= 3) break;
    parts.push(v >= 0.65 ? AXES[i][sp.sides[i] === 0 ? 'p0' : 'p1'] : AXES[i].mix);
  }
  const intro = `${role} ${years}년차. ${parts[0]}, ${parts[1]} 사람. ${parts[2]} 편이다.`;
  return {
    id: 'P' + String(idx + 1).padStart(3, '0'),
    name: names[idx],
    role, years, title,
    age: 23 + years + Math.floor(R() * 5),
    company,
    workstyle: weighted(WORKSTYLE),
    entry: pick(CONTEXT),
    profile: sp.profile,
    trueType: codeOf(sp.sides),
    axes: AXES.map((a, i) => ({ axis: a.n, pole: a.l[sp.sides[i]], strength: st[i] })),
    carelessness,
    desirability,
    intro
  };
});
personas.sort((a, b) => a.id < b.id ? -1 : 1);

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'personas.json'), JSON.stringify({
  note: '가상 인물 100명. 실제 사람과 무관하며, 시험용 응답 모델의 입력으로만 쓴다.',
  seed: 20261118,
  personas
}, null, 1) + '\n');

const lines = [];
lines.push('# 가상 페르소나 100명', '', '모두 가상 인물이며 실제 사람과 무관합니다. 고정 시드(20261118)로 `make-personas.js`가 생성합니다.', '',
  '구성은 32유형 x 3명(뚜렷형, 보통형, 애매형) + 전축 애매형 4명입니다. "진짜 유형"은 이 인물이 가진 성향이고, 시험은 이 유형이 결과로 나오는지를 봅니다.', '',
  '| ID | 이름 | 직무 | 연차 | 회사 | 진짜 유형 | 프로필 | 한 줄 소개 |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const p of personas) lines.push(`| ${p.id} | ${p.name} | ${p.role} | ${p.years}년차 ${p.title} | ${p.company} | ${p.trueType} | ${p.profile} | ${p.intro} |`);
fs.writeFileSync(path.join(dir, 'personas.md'), lines.join('\n') + '\n');
console.log('페르소나', personas.length, '명 생성. 유형 종류', new Set(personas.map(p => p.trueType)).size);
const byProfile = {}; personas.forEach(p => byProfile[p.profile] = (byProfile[p.profile] || 0) + 1);
console.log(JSON.stringify(byProfile));
