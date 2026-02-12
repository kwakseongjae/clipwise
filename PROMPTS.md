# Clipwise AI Scenario Guide

AI(ChatGPT, Claude 등)와 함께 Clipwise 시나리오를 작성하는 가이드입니다.

## Quick Start — AI에게 이것만 복붙하세요

아래 프롬프트를 AI에게 붙여넣고, `[내 사이트 URL]`과 `[녹화하고 싶은 동작]`만 바꾸면 됩니다.

---

### Prompt Template

```
나는 Clipwise라는 도구를 사용해서 내 웹사이트의 데모 영상을 자동으로 만들고 싶어.
Clipwise는 YAML 시나리오 파일을 읽어서 Playwright로 브라우저를 자동 조작하고,
시네마틱 이펙트(줌, 커서, 디바이스 프레임 등)를 적용해서 MP4/GIF를 생성해.

내 사이트: [URL을 입력하세요. 예: http://localhost:3000]

녹화하고 싶은 동작:
[자유롭게 적으세요. 예:
- 메인 페이지 로드
- 로그인 버튼 클릭
- 이메일/비밀번호 입력
- 대시보드에서 차트 확인
- 프로필 설정 변경]

아래 YAML 스키마를 참고해서 clipwise.yaml 시나리오를 작성해줘.

## Clipwise YAML Schema

### 최상위 구조
name: string          # 시나리오 이름
viewport:
  width: 1280         # 브라우저 너비 (기본: 1280)
  height: 800         # 브라우저 높이 (기본: 800)
effects:              # 이펙트 설정 (아래 참조)
output:
  format: mp4         # mp4 | gif | png-sequence
  fps: 30
  quality: 80         # 1-100 (높을수록 고화질, 파일 큼)
steps: []             # 스텝 배열 (아래 참조)

### 스텝 구조
- name: "스텝 이름"
  captureDelay: 50    # 액션 후 캡처 대기(ms). 50-100 권장
  holdDuration: 700   # 결과 화면 유지(ms). 500-800 권장 (빠른 느낌)
  transition: none    # none | fade
  actions:            # 액션 배열

### 사용 가능한 액션
1. navigate — 페이지 이동
   - action: navigate
     url: "http://localhost:3000/dashboard"
     waitUntil: load    # load | domcontentloaded | networkidle

2. click — 요소 클릭
   - action: click
     selector: "#login-btn"

3. type — 텍스트 입력 (한 글자씩)
   - action: type
     selector: "#email-input"
     text: "user@example.com"
     delay: 18          # 글자당 딜레이(ms). 15-25 권장

4. hover — 요소에 마우스 올리기
   - action: hover
     selector: ".card:first-child"

5. scroll — 스크롤
   - action: scroll
     y: 400             # 아래로 400px
     smooth: true

6. wait — 대기
   - action: wait
     duration: 1000     # 1초 대기

### 이펙트 설정
effects:
  deviceFrame:
    enabled: true
    type: browser       # browser | iphone | ipad | android
    darkMode: true
  cursor:
    enabled: true
    speed: "fast"       # fast | normal | slow
    clickEffect: true
    highlight: true
    trail: true
  background:
    type: gradient
    value: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)"
    padding: 48
    borderRadius: 14
    shadow: true
  zoom:
    enabled: true
    scale: 1.8
  keystroke:
    enabled: true
    position: bottom-center
  watermark:
    enabled: true
    text: "My App"

### 중요한 규칙
- selector는 CSS 선택자 사용 (#id, .class, [data-testid="..."])
- 클릭/호버 전에 해당 요소가 화면에 보여야 함 → 필요하면 scroll 먼저
- type 전에 input 요소를 click으로 포커스해야 함
- 스텝은 많을수록 영상이 풍성함 (15-25개 스텝이 30초 분량에 적절)
- holdDuration은 500-800ms가 스피디한 느낌
- type.delay는 15-25ms가 자연스럽고 빠른 타이핑

이 규칙들을 지켜서 YAML을 생성해줘.
```

---

## 고급 사용법

### 모바일 시나리오 요청

```
위와 동일한데, iPhone 목업으로 만들어줘.
viewport을 390x844로, deviceFrame.type을 "iphone"으로 설정하고,
output 크기는 540x1080으로 해줘.
사이드바 같은 데스크탑 전용 요소는 제외해줘.
```

### 특정 이펙트 조합

```
배경은 다크 그라디언트, 커서 트레일 켜고, 줌 스케일 2.0으로 해줘.
키스트로크 HUD도 켜서 타이핑하는 내용이 화면에 보이게 해줘.
워터마크는 "Beta" 텍스트로 왼쪽 상단에 넣어줘.
```

### 시나리오 디버깅 요청

```
이 시나리오를 실행했는데 에러가 났어:
[에러 메시지 붙여넣기]

YAML:
[YAML 내용 붙여넣기]

원인을 분석하고 수정해줘.
```

---

## 테스트 워크플로우

```bash
# 1. AI가 생성한 YAML 저장
# my-demo.yaml

# 2. 문법 검증 (빠름, 녹화 안 함)
npx clipwise validate my-demo.yaml

# 3. 녹화
npx clipwise record my-demo.yaml -f mp4 -o ./output

# 4. 결과 확인 후 AI에게 피드백
# "3번 스텝에서 버튼이 화면 밖에 있어서 안 보여. scroll을 추가해줘"
# "타이핑이 너무 느려. delay를 15로 줄여줘"
# "hover 후 줌인이 안 맞아. holdDuration을 800으로 늘려줘"
```

---

## 셀렉터 찾는 법

AI에게 셀렉터를 알려주는 가장 쉬운 방법:

1. **개발자 도구**: Chrome에서 F12 → Elements → 요소 우클릭 → Copy selector
2. **data-testid**: React/Vue 프로젝트면 `[data-testid="login-btn"]` 사용
3. **AI에게 HTML 공유**: 페이지의 HTML 구조를 공유하면 AI가 셀렉터를 찾아줌

```
내 페이지의 주요 HTML 구조야:
[HTML 붙여넣기]

여기서 로그인 버튼, 이메일 입력, 대시보드 차트를 클릭하는
Clipwise 시나리오를 만들어줘.
```
