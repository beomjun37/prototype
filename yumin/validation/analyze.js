#!/usr/bin/env node
/*
 * 수렴 타당도 분석: 우리 테스트의 축 점수와 IPIP 20문항(Big Five)의 상관
 *
 * 사용: node yumin/validation/analyze.js 응답.csv [보고서.md]
 *
 * 입력 CSV 열: id, result, i1, i6, i9, i10, i15, i16, i17, i18, i19, i20, i22, i23, i28, i29, i30, i31, i32, i33, i39, i42
 *   - result: 결과 화면 주소 또는 주소 끝의 코드(#r=abcde 의 abcde)
 *   - i숫자: IPIP 50문항 번호(mini20-ko.json 참고), 값은 1~5
 * 결과 코드에서 축별 점수(0~5, 클수록 첫째 극)를 복원해서, 영역 점수와 상관을 계산한다.
 *
 * 한계: 결과 코드에는 축별 점수만 들어 있어서 문항 단위 분석은 할 수 없다.
 *       상관 해석의 기준(.30, .40)은 심리측정에서 흔히 쓰는 관례이며 이 서비스에 맞춘 값이 아니다.
 */
const fs = require('fs');
const path = require('path');

const M36 = 60466176;
const CODES = ['BRWD', 'BRWL', 'BRHD', 'BRHL', 'BVWD', 'BVWL', 'BVHD', 'BVHL', 'QRWD', 'QRWL', 'QRHD', 'QRHL', 'QVWD', 'QVWL', 'QVHD', 'QVHL'];
const KEYS = []; CODES.forEach(c => ['C', 'N'].forEach(m => KEYS.push(c + m)));

function encId(code, mood, sc, w) {
  const ci = KEYS.indexOf(code + mood); let sv = 0;
  for (let i = 0; i < 5; i++) sv = sv * 6 + sc[i];
  let n = (ci * 7776 + sv) * 26 + Math.min(25, w || 0);
  n = (n * 7919 + 12345) % M36;
  let t = n.toString(36); while (t.length < 5) t = '0' + t; return t;
}
function decId(t) {
  if (!/^[0-9a-z]{5}$/.test(t)) return null;
  let n = parseInt(t, 36);
  n = ((n - 12345) % M36 + M36) % M36;
  n = Number((BigInt(n) * 48493583n) % BigInt(M36));
  const w = n % 26; n = (n - w) / 26;
  let sv = n % 7776; const ci = (n - sv) / 7776;
  if (ci >= KEYS.length) return null;
  const sc = [];
  for (let i = 4; i >= 0; i--) { sc[i] = sv % 6; sv = (sv - sc[i]) / 6; }
  return { type: KEYS[ci], sc };
}
module.exports = { encId, decId, KEYS };

if (require.main === module) {
  const file = process.argv[2], out = process.argv[3];
  if (!file) { console.error('사용: node yumin/validation/analyze.js 응답.csv [보고서.md]'); process.exit(2); }
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'mini20-ko.json'), 'utf8')).items;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(',').map(s => s.trim());
  const rows = lines.slice(1).map(l => { const c = l.split(','); const o = {}; head.forEach((h, i) => o[h] = (c[i] || '').trim()); return o; });

  // 영역 점수: 정서 안정(4)은 높을수록 안정. 역문항은 6 - 응답.
  const DOM = { 1: '외향성', 2: '우호성', 3: '성실성', 4: '정서 안정', 5: '지성·상상' };
  const AX = ['충전', '일을 보는 눈', '기준', '마감 리듬', '멘탈'];
  // 우리 축 점수는 클수록 첫째 극(북적, 눈앞, 일, 미리, 침착). 대응 영역과 기대하는 부호.
  const EXPECT = [[1, +1], [5, -1], [2, -1], [3, +1], [4, +1]];
  const use = [], skipped = [];
  rows.forEach(r => {
    const code = (r.result.match(/r=([0-9a-z]{5})/) || [null, r.result])[1];
    const d = decId(code);
    const vals = meta.map(m => parseFloat(r['i' + m.no]));
    if (!d || vals.some(v => !(v >= 1 && v <= 5))) { skipped.push(r.id); return; }
    const dom = {}; [1, 2, 3, 4, 5].forEach(k => {
      const its = meta.filter(m => m.domain === k);
      dom[k] = its.reduce((s, m) => s + (m.key === '-' ? 6 - parseFloat(r['i' + m.no]) : parseFloat(r['i' + m.no])), 0) / its.length;
    });
    use.push({ id: r.id, sc: d.sc, dom });
  });

  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  function pearson(x, y) {
    const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  function ci95(r, n) { if (n <= 3 || !isFinite(r) || Math.abs(r) >= 1) return [NaN, NaN]; const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3); return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)]; }
  function alpha(domain) {
    const its = meta.filter(m => m.domain === domain); const k = its.length;
    const cols = its.map(m => use.map(u => 0)); // 자리 채우기
    const data = use.map(u => its.map(m => { const raw = rows.find(r => r.id === u.id)['i' + m.no]; const v = parseFloat(raw); return m.key === '-' ? 6 - v : v; }));
    const varOf = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
    const itemVar = its.map((_, j) => varOf(data.map(r => r[j]))).reduce((a, b) => a + b, 0);
    const totVar = varOf(data.map(r => r.reduce((a, b) => a + b, 0)));
    return k / (k - 1) * (1 - itemVar / totVar);
  }
  const n = use.length;
  const L = [];
  L.push('# 수렴 타당도 분석 보고서', '', `- 입력: ${path.basename(file)}, 사용 ${n}명, 제외 ${skipped.length}명${skipped.length ? ' (' + skipped.join(', ') + ')' : ''}`);
  if (n < 30) L.push('- **표본이 30명 미만이라 상관 추정이 매우 불안정합니다. 참고용으로만 보세요.**');
  L.push('- 해석 기준은 관례입니다: 대응 영역과의 상관이 .40 이상이면 양호, .30~.40이면 보통, .30 미만이면 문항 재작성 대상. 같은 표본에서 r=.30을 80% 확률로 잡으려면 약 85명이 필요합니다.', '');
  L.push('## 영역 점수의 내적 일관성 (Cronbach alpha)', '', '| 영역 | alpha |', '| --- | --- |');
  [1, 2, 3, 4, 5].forEach(k => L.push(`| ${DOM[k]} | ${n > 2 ? alpha(k).toFixed(2) : '-'} |`));
  L.push('', '참고: 공식 사이트의 Mini-IPIP 특성표에서 영역별 alpha는 .65~.77입니다. 문항이 4개뿐이라 이 정도가 일반적입니다.', '');
  L.push('## 대응 영역과의 상관 (수렴)', '', '| 우리 축 | 대응 영역 | 기대 부호 | r | 95% 신뢰구간 | 판정 |', '| --- | --- | --- | --- | --- | --- |');
  const R = [];
  AX.forEach((name, a) => {
    const [d, sg] = EXPECT[a];
    const r = pearson(use.map(u => u.sc[a]), use.map(u => u.dom[d]));
    const ci = ci95(r, n);
    const eff = r * sg;
    const verdict = !isFinite(r) ? '계산 불가' : eff >= 0.4 ? '양호' : eff >= 0.3 ? '보통' : eff > 0 ? '재작성 대상' : '부호 반대';
    R.push([a, d, r]);
    L.push(`| ${name} | ${DOM[d]} | ${sg > 0 ? '+' : '-'} | ${isFinite(r) ? r.toFixed(2) : '-'} | ${isFinite(ci[0]) ? ci[0].toFixed(2) + ' ~ ' + ci[1].toFixed(2) : '-'} | ${verdict} |`);
  });
  L.push('', '"기대 부호"는 첫째 극이 어느 방향인지를 반영합니다. 일을 보는 눈의 첫째 극은 현실 쪽이라 지성·상상과 음의 상관, 기준의 첫째 극은 일 쪽이라 우호성과 음의 상관이 기대됩니다.', '');
  L.push('## 전체 상관 행렬 (우리 축 x 영역, 판별 확인용)', '', '| 우리 축 | ' + [1, 2, 3, 4, 5].map(k => DOM[k]).join(' | ') + ' |', '| --- | ' + [1, 2, 3, 4, 5].map(() => '---').join(' | ') + ' |');
  AX.forEach((name, a) => L.push(`| ${name} | ` + [1, 2, 3, 4, 5].map(k => { const r = pearson(use.map(u => u.sc[a]), use.map(u => u.dom[k])); return (k === EXPECT[a][0] ? '**' : '') + (isFinite(r) ? r.toFixed(2) : '-') + (k === EXPECT[a][0] ? '**' : ''); }).join(' | ') + ' |'));
  L.push('', '굵은 글씨가 대응 영역입니다. 대응 영역의 상관이 같은 행의 다른 영역보다 절대값으로 커야 "다른 것을 재고 있지 않다"고 볼 수 있습니다.', '');
  const bad = AX.map((name, a) => { const row = [1, 2, 3, 4, 5].map(k => Math.abs(pearson(use.map(u => u.sc[a]), use.map(u => u.dom[k])))); const own = row[EXPECT[a][0] - 1]; const maxOther = Math.max(...row.filter((_, i) => i !== EXPECT[a][0] - 1)); return maxOther > own ? name : null; }).filter(Boolean);
  L.push(bad.length ? `**판별 문제 가능성**: ${bad.join(', ')} 축은 대응 영역이 아닌 영역과 더 높은 상관을 보입니다.` : '대응 영역이 다른 영역보다 높은 상관을 보이는 축은 모두 통과했습니다.');
  const text = L.join('\n') + '\n';
  if (out) fs.writeFileSync(out, text);
  console.log(text);
}
