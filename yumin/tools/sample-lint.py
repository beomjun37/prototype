#!/usr/bin/env python3
"""샘플 결과지 문장 점검 (yumin/references/writing-groundrules.md의 자동 항목)
사용: python3 yumin/tools/sample-lint.py yumin/samples/qvhd-sample.json
한 결과지(C 또는 N) 단위로 묶어서 본다. 경계 문구는 C 결과지에 Q,V,H,D,C, N 결과지에 Q,V,H,D,N을 붙인다.
문장 길이(A1)는 대사(큰따옴표 안)를 빼고 센다. '후배들'처럼 자연스러운 '들'도 A2에 잡히니 사람이 판단한다."""
import json, re, sys
from collections import Counter

p = sys.argv[1] if len(sys.argv) > 1 else 'yumin/samples/qvhd-sample.json'
d = json.load(open(p, encoding='utf8'))
SPLIT = re.compile(r'(?<=[.?!])\s+|(?<=[.?!]")\s+|\n')
ADV = ['정말', '너무', '굉장히', '그냥', '바로', '진짜', '엄청']
PROMO = ['마법', '놀라운', '완벽한', '최고의', '특별한']
CLICHE = ['빛나', '나침반', '등대', '길을 비추']
DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
APHOR = [r'[^ ]+도, ', r'가 아니라', r'이 아니라', r'단순히']
HEDGE = ['가끔', '때로는', '때로', '종종', '기분 내키', '상황에 따라', '경우에 따라']  # v1.1 L7 경고
ENDSUM = [r'이유예요', r'가장 큰 일은', r'거예요\.$']

import itertools
_CNT = itertools.count()

def fill_name(t, name):
    last = name[-1]
    jong = (ord(last) - 0xAC00) % 28 if '가' <= last <= '힣' else 0
    t = re.sub(r'\{답변[12]\}', lambda m: 'x%d' % next(_CNT), t)
    return t.replace('{이름은}', name + ('은' if jong else '는')).replace('{이름이}', name + ('이' if jong else '가')).replace('{이름을}', name + ('을' if jong else '를'))

def outside_quotes(t):
    return re.sub(r'"[^"]*"', '', t)

def items(k):
    out = []
    for c in d['cells']:
        v = c[k]
        if isinstance(v, dict):
            out.append((f"{c['no']}.{c['cell']}", '\n'.join(v.values()), None))
        else:
            out.append((f"{c['no']}.{c['cell']}", v, c['limit'] if c['limit'][1] else None))
            if 'story' in c:
                out.append((f"{c['no']}.{c['cell']} 에피소드", c['story'][k], c['story']['limit']))
    nm = d['cells'][0][k]['name'].split()[-1]
    for b in ['Q', 'V', 'H', 'D', k]:
        out.append((f"경계 {b}", fill_name(d['boundary'][b], nm), None))
    return out

total = 0
for k in 'CN':
    print(f'===== {k} 결과지')
    its = items(k)
    issues = []
    soft = []
    sents = []
    for name, t, lim in its:
        n = len(t)
        if lim and not lim[0] <= n <= lim[1]:
            issues.append(f'[E1 길이] {name}: {n}자 (기준 {lim[0]}~{lim[1]})')
        o = outside_quotes(t)
        for s in SPLIT.split(t):
            s = s.strip()
            if not s: continue
            sents.append((name, s))
            ln = len(outside_quotes(s))
            if ln > 60: issues.append(f'[A1 긴 문장 {ln}자(최대 60자), 대사 제외] {name}: {s}')
            elif ln > 50: soft.append(f'[A1 50자 초과 {ln}자, 60자까지 허용] {name}')
        jeok = len(re.findall(r'적(인|으로)|의 |것|들(은|이|을|의|도) ', o))
        if jeok >= 3: issues.append(f'[A2 적의것들 {jeok}개] {name}')
        if re.search(r'(것 |거 )?같(다|아요)|에 대한|중 하나', o): issues.append(f'[A3] {name}: 같다/에 대한/중 하나')
        if len(re.findall(r'것이다|것이에요|거예요',o))>=2: issues.append(f'[L 것이다 반복] {name}')
        if re.search(r'듯해요|듯하다|일지도|수도 있|것 같',o): issues.append(f'[L 추측 표현] {name}')
        for w in ADV:
            if w in o: issues.append(f'[A4 부사 "{w}"] {name}')
        for w in HEDGE:
            if w in o: soft.append(f'[L7 도피성 부사 경고 "{w}"] {name}')
        for w in PROMO:
            if w in t: issues.append(f'[B3 홍보성 "{w}"] {name}')
        for w in CLICHE:
            if w in t: issues.append(f'[B4 상투 비유 "{w}"] {name}')
        for w in DAYS:
            if w in t: issues.append(f'[B5 요일 "{w}"] {name}')
        for r in APHOR:
            if re.search(r, o): issues.append(f'[B1 대구 의심 "{r}"] {name}')
        for r in ENDSUM:
            if re.search(r, o.strip()): issues.append(f'[B2 끝맺음 요약 의심 "{r}"] {name}')
    first = Counter(s[:3] for _, s in sents)
    for f, c in first.items():
        if c > 2: issues.append(f'[B6 첫머리 "{f}" {c}회]')
    dup = [s for s, c in Counter(s for _, s in sents).items() if c > 1]
    for s in dup: issues.append(f'[중복 문장] {s}')
    for i in issues: print(' ', i)
    for i in soft:
        if i.startswith('[L7'): print(' ', i)
    print(f'  → {len(issues)}건 (경고 {len(soft)}개: 50~60자 허용 구간, L7 도피성 부사)')
    total += len(issues)
print('합계', total)
