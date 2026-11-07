#!/usr/bin/env python3
"""팀용 원본(개발자 화면 포함)에서 공개용 파일을 만든다.
쓰는 법: python3 build-public.py 원본.html 공개본.html
<!--DEV-->...<!--/DEV--> 와 /*DEV*/.../*/DEV*/ 사이를 지운 뒤, 공개본에 MBTI 같은 말이 남았는지 검사한다."""
import re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
s = re.sub(r'<!--DEV-->.*?<!--/DEV-->', '', s, flags=re.S)
s = re.sub(r'/\*DEV\*/.*?/\*/DEV\*/', '', s, flags=re.S)
s = re.sub(r'#dev\b[^{]*\{[^}]*\}', '', s)  # 개발자 화면 CSS
bad = [w for w in ['MBTI', 'mbti(', 'devRender', '개발자', '16Personalities'] if w in s]
if bad:
    sys.exit('공개본에 남은 말: ' + ', '.join(bad))
open(out, 'w', encoding='utf-8').write(s)
print('공개본 만듦:', out, len(s), 'bytes')
