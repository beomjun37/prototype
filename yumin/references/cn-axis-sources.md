# 5번째 축(C/N)의 근거 정리

확인 일자: 2026-11-19. 직접 읽은 것은 [직접 확인], 검색 결과 요약만 본 것은 [검색 요약만], 못 읽은 것은 [미확인]으로 표시합니다.

## 1. 출처: 16Personalities의 Identity 척도 (Assertive / Turbulent, -A/-T)

- MBTI(Myers-Briggs Type Indicator)에는 5번째 글자가 없다. 우리 C/N의 모델은 16Personalities의 **Identity: Assertive (-A) / Turbulent (-T)** 로 보인다.
- [직접 확인] 16Personalities 공식 AI 참고 페이지(`https://www.16personalities.com/for-ai.json`)에 "The Assertive-Turbulent Identity scale is a defining feature of the 16Personalities framework", 척도 이름 "Identity", 양극 "Assertive (-A)", "Turbulent (-T)"로 적혀 있다. 해당 설명 글: `https://www.16personalities.com/articles/identity-assertive-vs-turbulent` (페이지가 스크립트로 그려져서 **본문은 못 읽었다. [미확인]**)
- [검색 요약만] Identity는 자신감, 자기 의심, 스트레스, 피드백에 대한 반응을 다룬다고 설명하고, Big Five를 기반으로 한다고 밝힌다. 신뢰도 α=0.86(1만 명), 재검사 0.78(5~7개월, 2,900명)이라고 한다. 업체 자체 자료이며 독립 검증이 아니다. `https://16personalities.com/articles/reliability-and-validity` (본문은 스크립트로 그려져서 직접 확인 못 함)
- **[미확인]** Identity가 Big Five의 Neuroticism(신경성)과 같다고 업체가 명시한 문장은 찾지 못했다. 같다고 단정하지 않는다.

## 2. 학술 쪽 후보

### 2-1. Neuroticism / Emotional Stability (Big Five)
- IPIP(International Personality Item Pool): 공개 도메인, 상업적 사용 가능. `https://ipip.ori.org/`
- [직접 확인] IPIP-NEO 하위 척도 원문(`https://ipip.ori.org/newNEOFacetsKey.htm`, "Items in Each of the Preliminary IPIP Scales Measuring Constructs Similar to Those in the 30 NEO-PI-R Facet Scales"). 아래 알파는 같은 페이지에 적힌 값이다.
  - N1 Anxiety (α .83): "Worry about things." "Fear for the worst." "Get stressed out easily." "Am not easily disturbed by events." ...
  - N3 Depression (.88): "Have a low opinion of myself." "Feel comfortable with myself."(−) "Am very pleased with myself."(−) ...
  - N4 Self-Consciousness (.80): "Am afraid that I will do the wrong thing." "Am easily intimidated." "Am able to stand up for myself."(−) ...
  - N6 Vulnerability (.82): "Panic easily." "Become overwhelmed by events." "Can't make up my mind." "Remain calm under pressure."(−) "Know how to cope."(−) ...
  - C1 Self-Efficacy (.78): "Complete tasks successfully." "Excel in what I do." "Am sure of my ground." "Know how to get things done." ...
  - C6 Cautiousness (.76): "Avoid mistakes." "Choose my words with care." (−) "Jump into things without thinking." "Make rash decisions." ...

### 2-2. Core Self-Evaluations (CSES)
- Judge, T. A., Erez, A., Bono, J. E., & Thoresen, C. J. (2003). The Core Self-Evaluations Scale: Development of a measure. *Personnel Psychology, 56*(2), 303-331.
- [검색 요약만] 12문항, 5점 척도. self-esteem, generalized self-efficacy, locus of control, neuroticism을 묶은 개념. 비영리 자유 사용. 예시 문항 "When I try, I generally succeed."
- **[미확인]** 12문항 전문과 라이선스 문구. 보관 사이트(`https://dlab.sauder.ubc.ca/sjdm/dmidi/Core%20Self-Evaluations%20Scale.html`)는 이 환경에서 연결이 끊겨 읽지 못했다. 전문을 확인하기 전에는 CSES 문항을 인용하지 않는다.

## 3. 우리 정의와의 차이 (변형 기록)

| | 원문 | 우리 정의(11/18) | 차이 |
|---|---|---|---|
| A극 | Assertive: 안정적, 걱정이 적음 | C: 자기확신으로 평온 | 평온함(Emotional Stability)에 더해 "자기 판단을 믿는다(self-confidence, Self-Efficacy)"를 강조했다. |
| T극 | Turbulent: 자의식, 완벽주의, 개선 욕구 | N: 신중(한 번 더 따져 봄) | **"신중"은 IPIP 기준 Conscientiousness의 Cautiousness(C6)에 가깝다. Neuroticism의 반대 극이 아니다.** 마감 리듬(D/L) 축과 겹칠 위험이 있다. |

권고: N을 "신중"이 아니라 "자기의심(한 번 더 확인)" 쪽으로 정의하면 Neuroticism(N3, N4, N6)과 대응하고 다른 축과 덜 겹친다. 이범준 님과 논의 필요.
