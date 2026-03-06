# Clipwise v0.6 Plan — Convention Alignment & Competitive Feature Adoption

> 작성일: 2026-03-06
> 기반: 경쟁 분석 (Screen Studio, VHS, Remotion, puppeteer-screen-recorder 등)

---

## Part 1: Convention Violations — 현재 기본값 문제점

현재 Clipwise의 일부 기본값이 업계 컨벤션과 어긋나 있어, 첫 사용자 경험(FTUE)을 해칠 수 있다.

### 1-1. Zoom 기본 강도가 너무 높음

| 항목 | Clipwise 현재 | Screen Studio | Loom | 권장 |
|------|--------------|---------------|------|------|
| 기본 scale | 1.35x (moderate) | ~1.15-1.2x | ~1.15x | **1.25x (light)** |
| 기본 duration | 600ms | ~800-1000ms | ~800ms | **800ms** |

**문제**: `moderate` (1.35x)는 클릭할 때마다 화면이 과하게 확대되어 시청자가 전체 맥락을 잃는다. Screen Studio와 Loom은 "살짝 당기는" 느낌의 1.15-1.2x를 사용한다.

**수정안**:
- `intensity` 기본값을 `"moderate"` → `"light"` (1.25x)로 변경
- `duration` 기본값을 `600ms` → `800ms`로 변경 (더 부드러운 전환)
- `scale` 기본값도 `1.35` → `1.25`로 일치시킴

### 1-2. Cursor 속도가 너무 빠름

| 항목 | Clipwise 현재 (fast) | Screen Studio | 권장 |
|------|---------------------|---------------|------|
| pixelsPerStep | 22 | — | 16 |
| stepDelayMs | 22ms | — | 26ms |
| 총 이동 시간 (500px) | ~72ms | ~200-300ms | **~144ms (normal)** |

**문제**: 기본 `"fast"` 속도는 커서가 순간이동하는 것처럼 보인다. 사용자가 커서 움직임을 시각적으로 추적할 수 없다. Screen Studio는 부드럽고 의도적인 커서 이동을 보여준다.

**수정안**:
- 기본 cursor speed를 `"fast"` → `"normal"`로 변경
- `"fast"`는 파워유저 옵션으로 유지

### 1-3. 기본 출력 포맷이 GIF

| 항목 | Clipwise 현재 | Screen Studio | VHS | 권장 |
|------|--------------|---------------|-----|------|
| 기본 format | gif | mp4 | gif | **mp4** |

**문제**: GIF는 256색 제한, 큰 파일 크기, 낮은 화질. 프로덕트 데모 용도에서 MP4가 압도적으로 유리하다. VHS는 터미널 (단색) 특성상 GIF가 적합하지만, 웹앱 데모는 MP4가 표준이다.

**수정안**:
- 기본 format을 `"gif"` → `"mp4"`로 변경
- README 예시도 MP4 우선으로 통일 (이미 README는 MP4 예시가 먼저 나옴)

### 1-4. autoZoom.followCursor — 미구현 설정이 스키마에 노출

**문제**: `autoZoom.followCursor`, `autoZoom.transitionDuration`, `autoZoom.padding`이 YAML 스키마에 정의되어 있지만 실제 동작하지 않는다. 사용자가 이 값을 설정해도 아무 효과가 없어 혼란을 준다.

**수정안** (택 1):
- **A) 구현**: followCursor 기능을 실제로 구현 (Part 2-2 참고)
- **B) 제거**: 스키마에서 미구현 필드를 제거하고 구현 시 재추가

**권장**: A — 경쟁력 있는 기능이므로 구현

### 1-5. Speed Ramp 기본 idleSpeed가 너무 공격적

| 항목 | Clipwise 현재 | 권장 |
|------|--------------|------|
| idleSpeed | 3.0 (프레임 2/3 스킵) | **2.0** |
| actionSpeed | 0.8 | 0.8 (유지) |

**문제**: `idleSpeed: 3.0`은 idle 구간에서 프레임의 66%를 건너뛰어 움직임이 뚝뚝 끊긴다. 특히 스크롤이나 애니메이션이 있는 idle 구간에서 눈에 띈다.

**수정안**:
- 기본 idleSpeed를 `3.0` → `2.0`으로 변경 (50% 스킵, 더 자연스러움)

### 1-6. quality/preset 이중 시스템

**문제**: `quality: 1-100` 숫자 시스템과 `preset: social|balanced|archive` 시스템이 공존한다. quality를 설정하면 내부적으로 preset으로 매핑되는데, 사용자 입장에서 혼란스럽다.

**수정안**:
- `quality` 필드를 deprecated로 표시 (이미 README에서 권장하지 않음)
- v0.7에서 `quality` 필드 완전 제거 예고
- 기본값을 `quality: 80` → `preset: "balanced"`로 명시적으로 변경

---

## Part 2: 경쟁 라이브러리에서 도입할 기능

차별점(YAML 시나리오, 시네마틱 후처리, 재현성)은 유지하면서, 경쟁 도구들의 검증된 기능을 선별적으로 도입한다.

### 2-1. Transition 타입 확장 (from: Screen Studio, Remotion)

**현재**: `none`, `fade` 2가지만 지원
**경쟁사**: Screen Studio — slide, zoom-blur / Remotion — 수십 가지 transition

**도입 범위** (실용적인 3가지 추가):

```yaml
transition: slide-left    # 새 화면이 왼쪽에서 밀고 들어옴
transition: slide-up      # 새 화면이 아래에서 밀고 올라옴
transition: blur          # 이전 화면 blur → 새 화면 fade-in
```

**구현 난이도**: 중 — `src/effects/transition.ts`에 per-pixel 연산 추가
**가치**: 스텝 간 전환이 더 시네마틱해짐. 현재 fade만으로는 단조로움

### 2-2. Cursor followCursor 실제 구현 (from: Screen Studio)

**현재**: 줌이 클릭 시에만 발동. 커서가 이동해도 뷰포트는 고정.
**Screen Studio**: 커서 이동에 따라 뷰포트가 부드럽게 패닝

**구현 설계**:
- 줌이 활성화된 상태(scale > 1)에서 커서가 뷰포트 가장자리 padding 영역에 진입하면 뷰포트를 부드럽게 이동
- 클릭 없이도 커서 위치 기반으로 focal point를 업데이트
- `autoZoom.padding` (이미 스키마에 존재)을 실제로 활용

```yaml
zoom:
  enabled: true
  intensity: light
  autoZoom:
    followCursor: true        # 커서 따라 뷰포트 패닝
    padding: 200              # 가장자리 200px 진입 시 패닝 시작
    transitionDuration: 400   # 패닝 애니메이션 시간
```

**구현 난이도**: 중상 — zoom focal point 계산 로직 변경 필요
**가치**: Screen Studio의 핵심 UX. 클릭 없는 hover/scroll 데모에서 큰 차이

### 2-3. Audio Narration 지원 (from: Screen Studio, Tella, Descript)

**현재**: 비디오만 출력. 오디오 없음.
**경쟁사**: Screen Studio — 마이크 녹음 / Descript — AI 보이스오버 / Tella — 브라우저 내 녹음

**도입 범위** (Phase 1 — 파일 기반):

```yaml
audio:
  file: "./narration.mp3"        # 미리 녹음된 오디오 파일
  volume: 0.8                    # 0-1
  fadeIn: 500                    # ms
  fadeOut: 1000                  # ms
```

- FFmpeg muxing 시 오디오 트랙 합성 (`-i audio.mp3 -c:a aac`)
- 시나리오 총 길이와 오디오 길이 불일치 시 짧은 쪽에 맞춰 자르기

**Phase 2 — TTS (향후)**:
```yaml
audio:
  tts:
    text: "This is the login page. Click here to..."
    voice: "alloy"              # OpenAI TTS voice
    provider: "openai"
```

**구현 난이도**: Phase 1 낮음 (FFmpeg 옵션 추가) / Phase 2 중 (TTS API 통합)
**가치**: 데모 비디오의 완성도를 크게 높임. 현재 무음 비디오는 전문성이 떨어져 보임

### 2-4. 공유/배포 기능 (from: VHS, asciinema)

**현재**: 로컬 파일 출력만 가능
**VHS**: `vhs publish` → charm.sh 서버에 GIF 호스팅, 공유 URL 제공
**asciinema**: asciinema.org에 업로드, 임베드 플레이어 제공

**도입 범위**:

```bash
npx clipwise publish output/demo.mp4
# → Uploaded! Share: https://clipwise.dev/s/abc123
# → Embed: <iframe src="https://clipwise.dev/e/abc123" ...>
```

**구현 난이도**: 높음 — 서버 인프라 필요 (S3 + CDN + 간단한 API)
**가치**: 바이럴 확산에 핵심. 하지만 인프라 비용 발생

**대안 (서버리스)**: GitHub Gist + raw URL, 또는 Cloudflare R2 무료 티어 활용
**우선순위**: 낮음 — v0.7+ 이후 검토

### 2-5. 인터랙티브 Step 편집기 (from: Remotion Studio)

**현재**: YAML을 텍스트 에디터에서 수동 편집
**Remotion**: Remotion Studio — 브라우저 기반 비주얼 에디터로 타임라인, 프리뷰 제공

**도입 범위**:

```bash
npx clipwise studio
# → http://localhost:4400 에서 브라우저 에디터 열림
```

- YAML 시나리오 시각적 편집 (스텝 추가/삭제/순서 변경)
- 각 스텝의 스크린샷 프리뷰 (record 없이 빠른 캡처)
- 이펙트 설정 슬라이더 (zoom, cursor, background 실시간 미리보기)

**구현 난이도**: 매우 높음 — 별도 웹 프론트엔드 개발 필요
**우선순위**: 낮음 — v1.0 비전으로 보류. 현재는 Claude Code Skill이 이 역할을 부분 대체

### 2-6. Per-Step 이펙트 오버라이드 (from: Remotion sequence concept)

**현재**: 이펙트 설정이 전체 시나리오에 일괄 적용
**Remotion**: 각 시퀀스마다 독립적인 스타일/이펙트 적용 가능

**도입 범위**:

```yaml
effects:
  zoom:
    intensity: light          # 글로벌 기본값

steps:
  - name: "Overview"
    effects:                  # 이 스텝에서만 오버라이드
      zoom:
        enabled: false        # 개요에서는 줌 끄기
    actions:
      - action: navigate
        url: "https://example.com"

  - name: "Click detail"
    effects:
      zoom:
        intensity: strong     # 디테일에서는 강한 줌
    actions:
      - action: click
        selector: "#detail-btn"
```

**구현 난이도**: 중 — 스텝별 effects merge 로직 + compose 시 stepIndex 기반 설정 전환
**가치**: 높음 — 시나리오 표현력이 크게 향상됨. 경쟁 도구 대비 강력한 차별점이 될 수 있음

---

## Part 3: 우선순위 & 로드맵

### v0.6.0 — Convention Alignment (기본값 수정)

| # | 항목 | 난이도 | 영향 |
|---|------|--------|------|
| 1 | Zoom 기본값: intensity light, duration 800ms | 낮음 | 높음 |
| 2 | Cursor 기본 speed: normal | 낮음 | 높음 |
| 3 | 기본 output format: mp4 | 낮음 | 중 |
| 4 | Speed ramp idleSpeed: 2.0 | 낮음 | 중 |
| 5 | quality 필드 deprecated 표시 | 낮음 | 낮음 |
| 6 | autoZoom 미구현 필드 정리 (스키마에서 제거 or 구현) | 낮음 | 중 |

> 전부 기본값/스키마 변경으로 구현 난이도가 낮다. FTUE 개선 효과가 크므로 즉시 진행.

### v0.7.0 — Expressiveness (표현력 강화)

| # | 항목 | 난이도 | 영향 |
|---|------|--------|------|
| 7 | Per-step 이펙트 오버라이드 | 중 | 높음 |
| 8 | Transition 타입 확장 (slide, blur) | 중 | 중 |
| 9 | Audio narration Phase 1 (파일 muxing) | 낮음 | 높음 |

> 시나리오 표현력을 높여 "Screen Studio급 품질을 코드로" 라는 핵심 가치를 강화.

### v0.8.0 — Smart Camera (스마트 카메라)

| # | 항목 | 난이도 | 영향 |
|---|------|--------|------|
| 10 | followCursor 뷰포트 패닝 구현 | 중상 | 높음 |
| 11 | Scroll-aware zoom (스크롤 시 줌아웃) | 중 | 중 |

> Screen Studio의 핵심 경쟁력인 "스마트 카메라"를 코드 기반으로 구현.

### v1.0 Vision (장기)

| # | 항목 | 비고 |
|---|------|------|
| 12 | clipwise studio (비주얼 에디터) | Remotion Studio 대응 |
| 13 | clipwise publish (공유 URL) | VHS publish 대응 |
| 14 | TTS narration (AI 음성) | Descript 대응 |
| 15 | Template marketplace | Remotion 커뮤니티 모델 |

---

## Part 4: 차별점 강화 전략

경쟁 분석에서 확인된 Clipwise만의 Blue Ocean 영역을 더 강화한다.

### 4-1. "Reproducible Demo Videos" 내러티브

VHS가 터미널에서 증명한 모델:
- YAML = Git 버전 관리 가능
- CI/CD 통합 (PR마다 자동 데모 영상 생성)
- 제품 업데이트 시 `npx clipwise record`만 재실행

**강화 방안**:
- GitHub Actions 공식 예시 추가 (`docs/ci-github-actions.md`)
- `clipwise diff` 명령어 — 두 YAML 시나리오 결과물의 시각적 차이 비교 (향후)

### 4-2. Claude Code Skill 생태계

현재 유일하게 AI 네이티브 시나리오 생성을 지원하는 도구.

**강화 방안**:
- Skill 품질 향상 — 더 정확한 YAML 생성 (selector 추론 개선)
- MCP 서버 통합 검토 — Claude Desktop에서도 사용 가능하게

### 4-3. Zero-Config 철학

`npx clipwise demo` 한 줄로 결과물을 볼 수 있는 경험은 독보적.

**강화 방안**:
- `npx clipwise record <url>` — YAML 없이 URL만으로 자동 시나리오 생성 (AI 기반, 향후)
- 기본값 최적화 (Part 1)로 설정 없이도 좋은 결과물 보장
