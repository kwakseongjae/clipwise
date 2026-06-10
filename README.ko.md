[English](./README.md) | [한국어](./README.ko.md)

# Clipwise

YAML 시나리오를 작성하면 시네마틱 데모 영상(MP4/GIF)을 자동으로 만들어주는 스크린 레코더. Playwright CDP 기반.

<p align="center">
  <video src="https://github.com/user-attachments/assets/800d956f-ecf3-40c4-8750-c93b34285f11" autoplay loop muted playsinline width="100%"></video>
</p>

> *`npx clipwise demo` 한 줄로 생성된 영상입니다 — YAML 파일 1개, 248줄.*

## 빠른 시작

```bash
# 설치 불필요 — npx로 바로 실행 (package.json 무수정)
npx clipwise@latest demo                       # 내장 데모 즉시 실행

# 또는 직접 시나리오 작성
npx clipwise@latest init                       # .clipwise/ 스캐폴딩 생성
# .clipwise/scenarios/demo.yaml 편집 — URL을 내 사이트로 변경
npx clipwise@latest record .clipwise/scenarios/demo.yaml
```

**Zero footprint**: Clipwise가 남기는 모든 것(시나리오, 픽스처, 인증 상태, 출력물)은
`.clipwise/` 디렉토리 하나에 담깁니다. `rm -rf .clipwise` 한 줄로 모든 흔적이 사라집니다.

### 처음 5분 가이드

1. `npx clipwise@latest init` — 바로 쓸 수 있는 시나리오 2개와 함께 `.clipwise/` 생성
2. `npx clipwise@latest record .clipwise/scenarios/keynote.yaml` — **수정 없이** 키노트
   런치 영상이 렌더됩니다 (호스팅 데모 대시보드를 녹화)
3. `.clipwise/output/keynote.mp4` 열기 — 이것이 기본으로 제공되는 퀄리티 기준입니다
4. `keynote.yaml` 수정: `url:`과 셀렉터를 **내 앱**으로 교체, 캡션 문구 조정
5. `brand.yaml` 수정: accent 컬러·폰트 프리셋·캐치프레이즈 — 영상 전체가 따라옵니다

자연어가 편하시면 `npx clipwise install-skill` 후 Claude Code에서 `/clipwise`로
요청하세요 — 키노트 레시피가 내장된 스킬이 YAML을 대신 작성합니다. 런치 영상이
아니라 단순 화면 녹화가 필요하면 `scenarios/demo.yaml`과 아래
[YAML 시나리오 형식](#yaml-시나리오-형식)에서 시작하세요.

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

# YAML 시나리오로 녹화 (출력 기본 위치: .clipwise/output)
npx clipwise record <scenario.yaml> -f mp4
npx clipwise record <scenario.yaml> -f gif -o ./custom-dir

# .clipwise/ 스캐폴딩 (시나리오, 픽스처, prepare 에셋, 인증 — 단일 디렉토리)
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

## Claude Code 스킬

Clipwise에는 [Claude Code](https://claude.com/claude-code) 스킬이 내장되어 있습니다. 설치 후 Claude Code에서 `/clipwise`를 입력하면 자연어로 YAML 시나리오 생성, 검증, 녹화까지 한 번에 할 수 있습니다.

### 스킬 설치

```bash
npx clipwise install-skill
```

`.claude/skills/clipwise.md`에 스킬 파일이 복사됩니다 (`.claude/` 디렉토리가 있으면 프로젝트 레벨, 없으면 `~/.claude/skills/`에 설치).

### 사용법

Claude Code 세션에서:

```
/clipwise
> http://localhost:3000 대시보드 데모 녹화해줘
  — 로그인 버튼 클릭, 이메일/비밀번호 입력, 분석 페이지 이동
```

Claude가 자동으로:
1. `clipwise.yaml` 시나리오 생성
2. `npx clipwise validate`로 검증
3. `npx clipwise record`로 MP4 녹화

### 업데이트 / 제거

clipwise 업그레이드 후 `npx clipwise install-skill`을 다시 실행하면 최신 스킬로 업데이트됩니다.
`npx clipwise install-skill --remove`로 언제든 제거할 수 있습니다 — 스킬 파일은
Clipwise가 `.clipwise/` 밖에 남기는 유일한 파일입니다.

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
  preset: social           # social | balanced | archive

steps:
  - name: "스텝 이름"
    actions:
      - action: navigate
        url: "https://example.com"
    captureDelay: 200       # 액션 후 대기(ms)
    holdDuration: 800       # 결과 화면 유지(ms)
    transition: none        # none | fade | slide-left | slide-up | blur
    effects:                # 스텝별 이펙트 오버라이드 (선택)
      zoom:
        enabled: false      # 이 스텝에서만 줌 비활성화
```

### 액션

#### 기본 액션

| 액션 | 파라미터 | 기본값 | 설명 |
|------|---------|--------|------|
| `navigate` | `url`, `waitUntil?` | `waitUntil: "networkidle"` | URL로 이동 |
| `click` | `selector`, `delay?`, `timeout?` | | 요소 클릭 |
| `type` | `selector`, `text`, `delay?`, `timeout?` | `delay: 50` | 텍스트 입력 (한 글자씩) |
| `hover` | `selector`, `timeout?` | | 요소에 마우스 올리기 |
| `scroll` | `y?`, `x?`, `selector?`, `smooth?`, `timeout?` | `y: 0`, `x: 0`, `smooth: true` | 스크롤 |
| `wait` | `duration` | | 대기 (ms) |
| `screenshot` | `name?`, `fullPage?` | `fullPage: false` | 캡처 마커 |

#### 비동기 대기 액션

| 액션 | 파라미터 | 기본값 | 설명 |
|------|---------|--------|------|
| `waitForSelector` | `selector`, `state?`, `timeout?` | `state: "visible"`, `timeout: 15000` | 요소 상태 대기 |
| `waitForNavigation` | `waitUntil?`, `timeout?` | `waitUntil: "networkidle"`, `timeout: 15000` | 페이지 로드 대기 |
| `waitForURL` | `url`, `timeout?` | `timeout: 15000` | URL 매칭 대기 |
| `waitForFunction` | `expression`, `polling?`, `timeout?` | `polling: "raf"`, `timeout: 30000` | JS 표현식이 truthy가 될 때까지 대기 |
| `waitForResponse` | `url`, `status?`, `timeout?` | `timeout: 30000` | 네트워크 응답 대기 (URL 부분 문자열 매칭) |

**`waitUntil`** 옵션: `"load"`, `"domcontentloaded"`, `"networkidle"` (기본)
**`state`** 옵션: `"visible"` (기본), `"attached"`, `"hidden"`
**`polling`** 옵션: `"raf"` (requestAnimationFrame, 기본) 또는 밀리초 숫자 (예: `500`)

#### 비동기 대기 예시

```yaml
# 요소가 나타날 때까지 대기
- action: waitForSelector
  selector: ".result-panel"
  state: visible
  timeout: 20000

# AI 스트리밍 응답 완료 대기
- action: waitForFunction
  expression: "document.querySelector('.ai-response')?.dataset.done === 'true'"
  timeout: 60000

# API 응답 완료 대기
- action: waitForResponse
  url: "/api/chat/completions"
  status: 200
  timeout: 60000

# 동적 콘텐츠 길이 대기
- action: waitForFunction
  expression: "document.querySelector('.output')?.textContent?.length > 100"
  polling: 500
```

### 타이밍 팁

빠른 데모 (~30초):
- `captureDelay: 50-100` ms
- `holdDuration: 500-800` ms
- `type.delay: 15-25` ms/글자

느린 시네마틱:
- `captureDelay: 200-400` ms
- `holdDuration: 1500-2500` ms
- `type.delay: 40-60` ms/글자

### 인증

브라우저 세션을 복원해 로그인 뒤 페이지를 녹화합니다. Playwright `storageState`
파일(권장) 또는 인라인 쿠키를 지원합니다.

```yaml
# 방법 1: Playwright storageState 파일 (쿠키 + localStorage)
auth:
  storageState: ../auth/auth-state.json

# 방법 2: 인라인 쿠키
auth:
  cookies:
    - name: session_id
      value: abc123
      domain: .example.com
```

대화형 로그인으로 `storageState` 파일 생성:

```bash
npx playwright codegen --save-storage=.clipwise/auth/auth-state.json https://my-app.com
```

### Prepare — 녹화 시 런타임 주입

**앱 코드를 건드리지 않고** 데모용으로 페이지를 조정합니다. `prepare`의 모든
항목은 녹화 브라우저에만 주입됩니다 — 소스, 빌드, DB는 무접촉이며 참조 파일은
전부 `.clipwise/` 안에 둡니다.

```yaml
prepare:
  # 데모에 어울리지 않는 요소 숨김 (쿠키 배너, dev 오버레이)
  hide:
    - "#cookie-banner"
    - "[data-nextjs-toast]"

  # 시계 동결 — 매 녹화마다 동일한 날짜 표시
  freezeTime: "2026-06-10T09:00:00Z"

  # Math.random 결정론화 — 매번 같은 차트/데이터
  seedRandom: 42

  # 앱 부팅 전 웹 스토리지 시드 (온보딩 건너뛰기, 플래그 설정)
  storage:
    localStorage:
      onboarding_done: "true"

  # API 응답 목(mock) — DB 시드 없이 데모 데이터 제공
  mock:
    - url: "/api/dashboard/stats"      # URL 부분 문자열 매칭
      fixture: ../fixtures/stats.json  # 이 YAML 기준 상대 경로
    - url: "/api/user"
      body: { name: "Demo User" }      # 또는 인라인

  # 그 외 모든 것 — 임의 CSS/JS 주입
  inject:
    css: ../prepare/demo.css
```

| 앱 코드를 수정하게 되는 압력 | Prepare 대체 |
|------------------------------|--------------|
| dev 오버레이/쿠키 배너 조건부 숨김 코드 | `hide:` |
| 시드 데이터를 가진 "데모 모드" 구현 | `mock:` |
| 일관된 데모를 위한 날짜/랜덤 스텁 | `freezeTime:` + `seedRandom:` |
| 녹화용 온보딩 사전 완료 분기 | `storage:` |

`freezeTime` + `seedRandom`을 함께 쓰면 녹화가 **결정론적**이 됩니다 —
같은 시나리오는 몇 번을 돌려도 바이트 단위로 동일한 프레임을 만듭니다.

### Scenes — 키노트 스타일 런치 영상 <sup>v0.9</sup>

`scenes:` 타임라인을 선언하면 `clipwise record` 한 번으로 완성된 런치 영상이
렌더됩니다: 키네틱 타이포 → 푸티지 비네트(크롭/푸시인/분할, 셀렉터 기반 선
드로잉 주석) → 아웃트로 — 컷을 넘어 이어지는 잉크 스레드로 연결됩니다.

```yaml
viewport: { width: 1280, height: 800, deviceScaleFactor: 2 }  # 2 = 레티나 출력

scenes:
  - type: screen            # 푸티지 테이크 — 1회 녹화, 비네트들이 인용
    id: demo
    steps: [...]            # 기존 steps 문법 그대로

  - type: motion            # 키네틱 타이포 (내장 템플릿)
    template: kinetic-type
    duration: 2200
    props: { lines: "Ship *demos*,||not edits.", size: 86 }

  - type: vignette          # 푸티지를 레이어로 — 카메라를 선언으로
    footage: demo
    duration: 4200
    layout: crop                                   # hero | crop | split
    label: "Smart Speed"
    caption: "로딩은 빠르게, *결과는 또렷하게*"
    crop: { selector: ".panel", pad: 14 }          # 픽셀이 아니라 셀렉터
    push: { from: 1.05, to: 1 }
    start: { step: 3 }                             # step 경계에서 인용 시작
    rate: 1.15
    fx: [{ kind: circle, selector: "#revenue", delay: 2500 }]
```

**고퀄리티 레시피** (쇼케이스 영상이 이렇게 나오는 이유):
1. `viewport.deviceScaleFactor: 2` — 레티나 해상도 캡처 (푸티지·타이포 전부)
2. `prepare:` — 배너 숨김, 시간 동결, 랜덤 시드, API 목킹
3. `.clipwise/brand.yaml` — 톤 프리셋, accent, 폰트 프리셋(`editorial` = Inter + Fraunces),
   캐치프레이즈. 선 드로잉 주석 + 연결 스레드는 자동 적용
4. 구성: 키네틱 훅 → 히어로 푸시인 → 클로즈업 비네트 → 인터스티셜 → 분할(YAML × 푸티지) → 아웃트로

가장 빠른 길: Claude Code 스킬 설치(`npx clipwise install-skill`) 후
`/clipwise`에 자연어로 요청하면 — 이 YAML을 대신 만들어줍니다.

## 이펙트

모든 이펙트는 선택사항이며 합리적인 기본값이 있습니다.

### 줌

적응형 줌 — 커서를 따라가며 클릭 대상에 자동 줌인. 강도 프리셋 또는 숫자 스케일로 설정.

```yaml
zoom:
  enabled: true
  intensity: light     # subtle | light | moderate | strong | dramatic
                       # 1.15x  | 1.25x | 1.35x    | 1.5x   | 1.8x
  # scale: 1.25       # 숫자로 직접 지정할 때 사용 (intensity 미설정 시)
  duration: 800        # 애니메이션 ms
  autoZoom:
    followCursor: true   # 커서 위치를 따라 뷰포트 패닝
    transitionDuration: 300
    padding: 200
```

| 강도 | 스케일 | 권장 사용처 |
|------|--------|------------|
| `subtle` | 1.15× | 정보 밀도 높은 UI, 큰 화면 |
| `light` | 1.25× | Loom 스타일 부드러운 줌 **(기본값)** |
| `moderate` | 1.35× | 균형잡힌 수준 (Camtasia 범위) |
| `strong` | 1.5× | 명확한 포커스 |
| `dramatic` | 1.8× | 최대 강조, 단순 UI 전용 |

**스마트 카메라**: 스크롤 중에는 줌이 자동 억제되어 어지러운 움직임을 방지합니다. `followCursor` 활성화 시 초점이 클릭 위치뿐 아니라 커서 위치를 부드럽게 따라갑니다.

### 커서

커스텀 커서 + 클릭 리플 + 트레일 + 하이라이트 + 속도 조절.

```yaml
cursor:
  enabled: true
  size: 20
  speed: "normal"      # fast (~72ms) | normal (~144ms) | slow (~288ms)
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
  url: "app.example.com"   # 주소창 표시 URL (기본: localhost)
```

| 타입 | 설명 |
|------|------|
| `browser` | macOS 브라우저 크롬 (신호등 버튼) |
| `iphone` | iPhone 15 Pro (Dynamic Island + 홈바) |
| `ipad` | iPad Pro (전면 카메라) |
| `android` | Android (펀치홀 카메라) |

### 키스트로크 HUD

화면 하단에 타이핑 내용을 표시하는 HUD. 기본값은 수정키+단축키만 표시 (Screen Studio, KeyCastr, ScreenFlow 등 업계 표준). `showTyping: true`로 일반 타이핑 내용도 표시 가능.

여러 입력 필드에 걸쳐 입력할 때는 각 필드가 별도 줄로 표시됩니다 (최대 3줄, 오래된 줄은 흐리게).

```yaml
keystroke:
  enabled: true
  showTyping: true       # 타이핑 내용 표시 (기본값: false — 단축키만)
  position: bottom-center
  fontSize: 16
  fadeAfter: 1500
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
  idleSpeed: 2.0        # 유휴 프레임 스킵 배수 (기본: 2.0)
  actionSpeed: 0.8
```

### 트랜지션

스텝 간 전환 효과를 지정합니다.

```yaml
steps:
  - name: "스텝 1"
    transition: fade        # none | fade | slide-left | slide-up | blur
    actions: [...]
```

| 트랜지션 | 설명 |
|----------|------|
| `none` | 하드 컷 (기본값) |
| `fade` | 크로스 디졸브 |
| `slide-left` | 나가는 프레임 왼쪽 슬라이드, 들어오는 프레임 오른쪽에서 진입 |
| `slide-up` | 나가는 프레임 위로 슬라이드, 들어오는 프레임 아래에서 진입 |
| `blur` | 나가는 프레임 블러 처리 + 크로스페이드 |

### 스텝별 이펙트 오버라이드

글로벌 이펙트를 스텝 단위로 오버라이드할 수 있습니다. 설정하지 않은 속성은 글로벌 설정을 상속합니다.

```yaml
effects:
  zoom:
    enabled: true
    intensity: light

steps:
  - name: "개요"
    effects:
      zoom:
        enabled: false      # 이 스텝에서만 줌 비활성화
    actions: [...]

  - name: "상세 보기"
    effects:
      zoom:
        intensity: strong   # 이 스텝에서만 강한 줌
    actions: [...]
```

### 오디오 내레이션

출력 MP4에 오디오 파일(MP3, WAV 등)을 첨부합니다.

```yaml
audio:
  file: "./narration.mp3"
  volume: 1.0              # 0.0 - 2.0 (기본: 1.0)
  fadeIn: 0                 # 페이드인 시간(초)
  fadeOut: 0                # 페이드아웃 시간(초)
```

## 성능

**Apple M1 Max (10코어)** 기준 — Pulse Dashboard 데모, 44초 @ 30fps, 1280×800:

| 단계 | v0.3.0 | v0.4.0 | v0.5.0 | v0.6.0 |
|------|--------|--------|--------|--------|
| 녹화 | 30.8 s | 31.1 s | 31.1 s | 31.1 s |
| 합성 + 인코딩 | 97.2 s | 60.6 s | 60.6 s | 60.6 s |
| **전체** | **127.9 s** | **91.7 s** | **91.7 s** | **91.7 s** |
| 캡처 프레임 수 | 1,303 | 902 | 902 | 902 |

v0.4.0 주요 최적화: 동시 스트리밍 파이프라인, 정적 프레임 중복 제거(~33% 건너뜀), 워커별 StaticLayers 캐시, raw RGBA 버퍼 파이프라인.

v0.5.0은 **녹화 품질** 개선에 집중: 부드러운 커서, 줌 강도 프리셋, 멀티세션 키스트로크 HUD.

v0.6.0은 **컨벤션 정렬 & 표현력** 강화: 부드러운 기본값 (light 줌, normal 커서 속도), 스텝별 이펙트 오버라이드, 새 트랜지션 (slide, blur), 오디오 내레이션, 스마트 카메라 (스크롤 줌 억제 + 커서 추적 포컬 포인트).

## 출력 압축

`preset` 필드로 화질과 파일 크기를 조절합니다:

```yaml
output:
  format: mp4
  fps: 30
  preset: social      # social | balanced | archive
```

| 프리셋 | libx264 CRF | HEVC VideoToolbox q:v | 용도 |
|--------|-------------|----------------------|------|
| `social` | 22 | 60 | Twitter, LinkedIn 등 소셜 공유 (~2-4 MB / 30초) |
| `balanced` | 18 | 70 | 범용, 포트폴리오 (~4-6 MB / 30초) |
| `archive` | 13 | 80 | 고화질 보관, 소스 마스터 (무제한) |

**권장**: 대부분의 데모에는 `preset: balanced`.

> **레거시**: `quality: 1-100`은 계속 작동하며 가장 가까운 프리셋으로 매핑됩니다 (`>= 75` → social, `>= 45` → balanced, `< 45` → archive). 명확성을 위해 `preset` 사용을 권장합니다.

### macOS — 하드웨어 가속

**Apple Silicon 및 Intel Mac**에서 Clipwise는 자동으로 `hevc_videotoolbox` (HEVC/H.265) 하드웨어 인코더를 사용합니다. 별도 설정 없이 소프트웨어 인코딩 대비 **~5–10× 빠른 인코딩** 속도를 제공합니다.

```
macOS (HEVC VideoToolbox)  →  44초짜리 1280×800 데모 기준 약 3분
Linux / Windows            →  동일 품질 기준 약 8–12분 (libx264)
```

VideoToolbox는 런타임에 자동 감지되며, 사용 불가 시 `libx264`로 자동 폴백합니다.

## AI로 시나리오 작성

[PROMPTS.md](./PROMPTS.md)에 바로 사용할 수 있는 AI 프롬프트 템플릿이 있습니다. ChatGPT나 Claude에 복붙하고 내 사이트 URL만 넣으면 YAML 시나리오를 생성해줍니다.

## GitHub Pages

`docs/` 폴더에 문서 사이트와 라이브 데모 대시보드가 포함되어 있습니다:

1. GitHub에 push: `git push origin main`
2. **Settings > Pages** > source: `main`, folder: `/docs`
3. 문서: `https://username.github.io/clipwise/`
4. 데모: `https://username.github.io/clipwise/demo/`

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
