[English](./README.md) | [한국어](./README.ko.md)

# Clipwise

YAML 시나리오를 작성하면 시네마틱 데모 영상(MP4/GIF)을 자동으로 만들어주는 스크린 레코더. Playwright CDP 기반.

<p align="center">
  <img src="https://github.com/kwakseongjae/clipwise/releases/download/v0.1.0/demo.gif" width="100%" alt="Clipwise Demo" />
</p>

> *`npx clipwise demo` 한 줄로 생성된 영상입니다.*

## 빠른 시작

```bash
# 설치
npm install -D clipwise

# 내장 데모 즉시 실행
npx clipwise demo

# 또는 직접 시나리오 작성
npx clipwise init                              # clipwise.yaml 템플릿 생성
# clipwise.yaml 편집 — URL을 내 사이트로 변경
npx clipwise record clipwise.yaml -f mp4       # 녹화!
```

## 요구사항

- **Node.js** >= 18
- **ffmpeg** (MP4 출력용)
- **Chromium** (첫 실행 시 Playwright가 자동 설치)

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg

# Windows
choco install ffmpeg
```

## 사용법

### CLI 명령어

```bash
# 즉시 데모 — 내장 대시보드 녹화
npx clipwise demo                          # 브라우저 프레임, MP4
npx clipwise demo --device iphone          # iPhone 목업
npx clipwise demo --device android         # Android 목업
npx clipwise demo --device ipad            # iPad 목업
npx clipwise demo --url https://my-app.com # 내 사이트 데모

# YAML 시나리오로 녹화
npx clipwise record <scenario.yaml> -f mp4 -o ./output
npx clipwise record <scenario.yaml> -f gif -o ./output

# 템플릿 초기화
npx clipwise init

# 녹화 없이 검증만
npx clipwise validate <scenario.yaml>
```

### 프로그래밍 API

```typescript
import { ClipwiseRecorder, CanvasRenderer, encodeMp4, loadScenario } from "clipwise";

const scenario = await loadScenario("my-scenario.yaml");
const recorder = new ClipwiseRecorder();
const session = await recorder.record(scenario);

const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
const frames = await renderer.composeAll(session.frames);

const mp4 = await encodeMp4(frames, scenario.output);
```

## YAML 시나리오 형식

시나리오는 4개 섹션으로 구성됩니다: 메타데이터, 이펙트, 출력, 스텝.

```yaml
name: "My Demo"
description: "선택 설명"

viewport:
  width: 1280    # 브라우저 너비 (기본: 1280)
  height: 800    # 브라우저 높이 (기본: 800)

effects:
  # 아래 "이펙트" 섹션 참조

output:
  format: mp4              # gif | mp4 | png-sequence
  width: 1280
  height: 800
  fps: 30                  # 1-60
  quality: 80              # 1-100 (MP4: CRF에 매핑)

steps:
  - name: "스텝 이름"
    actions:
      - action: navigate
        url: "https://example.com"
    captureDelay: 200       # 액션 후 대기(ms)
    holdDuration: 800       # 결과 화면 유지(ms)
    transition: none        # none | fade
```

### 액션

| 액션 | 파라미터 | 설명 |
|------|---------|------|
| `navigate` | `url`, `waitUntil?` | URL로 이동 |
| `click` | `selector`, `delay?` | 요소 클릭 |
| `type` | `selector`, `text`, `delay?` | 텍스트 입력 (한 글자씩) |
| `hover` | `selector` | 요소에 마우스 올리기 |
| `scroll` | `y?`, `x?`, `selector?`, `smooth?` | 스크롤 |
| `wait` | `duration` | 대기 (ms) |
| `screenshot` | `name?`, `fullPage?` | 캡처 마커 |

### 타이밍 팁

빠른 데모 (~30초):
- `captureDelay: 50-100` ms
- `holdDuration: 500-800` ms
- `type.delay: 15-25` ms/글자

느린 시네마틱:
- `captureDelay: 200-400` ms
- `holdDuration: 1500-2500` ms
- `type.delay: 40-60` ms/글자

## 이펙트

모든 이펙트는 선택사항이며 합리적인 기본값이 있습니다.

### 줌

적응형 줌 — 커서를 따라가며 클릭 대상에 자동 줌인.

```yaml
zoom:
  enabled: true
  scale: 1.8          # 최대 줌 (1-5)
  duration: 500        # 애니메이션 ms
```

### 커서

커스텀 커서 + 클릭 리플 + 트레일 + 하이라이트 + 속도 조절.

```yaml
cursor:
  enabled: true
  size: 20
  speed: "fast"        # fast (~72ms) | normal (~144ms) | slow (~288ms)
  clickEffect: true
  trail: true
  highlight: true
```

### 배경

그라디언트/단색 패딩 + 라운드 코너 + 그림자.

```yaml
background:
  type: gradient
  value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  padding: 48
  borderRadius: 14
  shadow: true
```

### 디바이스 프레임

녹화를 디바이스 목업으로 감싸기.

```yaml
deviceFrame:
  enabled: true
  type: browser          # browser | iphone | ipad | android | none
  darkMode: true
```

| 타입 | 설명 |
|------|------|
| `browser` | macOS 브라우저 크롬 (신호등 버튼) |
| `iphone` | iPhone 15 Pro (Dynamic Island + 홈바) |
| `ipad` | iPad Pro (전면 카메라) |
| `android` | Android (펀치홀 카메라) |

### 키스트로크 HUD

타이핑 내용을 화면 하단에 표시.

```yaml
keystroke:
  enabled: true
  position: bottom-center
  fontSize: 16
```

### 워터마크

코너에 텍스트 오버레이.

```yaml
watermark:
  enabled: true
  text: "Clipwise"
  position: bottom-right
  opacity: 0.5
```

### 속도 램프

클릭 근처 슬로우모션, 유휴 구간 빨리감기.

```yaml
speedRamp:
  enabled: true
  idleSpeed: 3.0
  actionSpeed: 0.8
```

## AI로 시나리오 작성

[PROMPTS.md](./PROMPTS.md)에 바로 사용할 수 있는 AI 프롬프트 템플릿이 있습니다. ChatGPT나 Claude에 복붙하고 내 사이트 URL만 넣으면 YAML 시나리오를 생성해줍니다.

## 데모 사이트 호스팅 (GitHub Pages)

`docs/index.html`에 데모 대시보드가 포함되어 있습니다:

1. GitHub에 push: `git push origin main`
2. **Settings > Pages** > source: `main`, folder: `/docs`
3. `https://username.github.io/clipwise/`에서 라이브

## 보안

- **셀렉터 검증**: YAML의 CSS 셀렉터는 안전한 문자만 허용
- **URL 처리**: `http://`, `https://`, `file://` 스키마만 허용
- **Chromium 샌드박스**: Playwright 기본 샌드박싱 적용
- **로컬 처리**: 녹화 프레임은 절대 외부로 전송되지 않음

## 개발

```bash
npm install          # 의존성 설치
npm run build        # tsup으로 빌드
npm run typecheck    # 타입 체크
npm test             # 테스트 (vitest)
```

## 라이선스

MIT
