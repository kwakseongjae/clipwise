# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-06-11

연출 4종 — 경쟁 도구 리서치(Screen Studio·Remotion·HyperFrames 등) 기반,
셀렉터·결정론이라는 구조적 우위를 살린 기능들.

### Added
- **`prepare.mask`** — 셀렉터 블러 마스크. 민감 정보(이메일·금액)를 녹화 시점에
  요소 단위로 블러 — 스크롤·이동을 자동으로 따라간다
- **`fx: spotlight`** — 대상만 남기고 주변을 디밍 (악센트 림 포함, 카메라 추적)
- **`push.origin`(매치컷)** — 셀렉터를 향해 푸시인 → 다음 신의 크롭으로 카메라가 이어짐
- **BGM + 비트 싱크 컷** — `audio: { file, bpm }` 지정 시 BGM이 최종 영상에 뮤지컬화되고
  모든 신 길이가 비트 격자(60000/bpm ms)에 스냅되어 컷이 비트 위에 떨어진다
  (volume/fadeIn/fadeOut 지원)

---

## [0.9.1] - 2026-06-11

온보딩 — "설치 후 헤매지 않게".

### Added
- **즉시 실행 keynote 스타터** — `init`이 `scenarios/keynote.yaml` 생성: 호스팅 데모
  대시보드 대상이라 **수정 0으로** 키노트 런치 영상이 렌더됨 (url/셀렉터만 교체하면 내 앱)
- README(EN/KO) "처음 5분 가이드" — init → 즉시 렌더 → 내 앱 교체 → brand 경로
- docs 사이트(EN/KO): Quickstart를 npx 스캐폴딩으로 교체, AI 스키마에 scenes 블록 추가

### Changed
- `init` 안내 출력 전면 개편 — "지금 바로 실행" 커맨드, 스킬 경로, 문서 링크 포함
- PROMPTS.md에 레거시 안내 배너 (스킬 경로 권장)

---

## [0.9.0] - 2026-06-11

Scene System — Keynote 연출 문법(고정 무대 + 푸티지 레이어 합성)을 엔진에 편입.
`scenes:` 타임라인을 YAML로 선언하면 `clipwise record` 한 명령으로
인트로 타이포 → 비네트(크롭·푸시인·분할·배속) → 아웃트로 영상을 렌더한다.
장면을 관통하는 잉크 스레드, 선 드로잉 주석, 폰트 프리셋, 레티나(2×) 캡처 포함.
(v0.8.0 항목과 함께 이번 릴리스로 배포)

### Added
- **`scenes:` 스키마** — `motion`(템플릿 seek 캡처) / `screen`(클린 푸티지 테이크) /
  `vignette`(푸티지 인용: crop·push·start·rate·fx) 3종 + validator 검증
- **Scene 런너** (`renderScenesTimeline`) — 셀렉터 실측 크롭/주석 좌표(`boundingBox`),
  step 경계 anchor 자동 산출, 푸티지 프레임 서버, 하드컷 concat
- **내장 모션 템플릿 출하** — `templates/motion/`(intro-title, feature-callout,
  kinetic-type, vignette)이 npm 패키지에 포함; 폰트 프리셋(editorial/grotesk/system)과
  선 드로잉 주석(underline/marker/circle/arrow) 내장
- CLI `record`가 scenes 타임라인을 자동 감지해 전용 런너로 렌더

### Added (화질)
- **`viewport.deviceScaleFactor`** — HiDPI 캡처 배율 (1–3). 2면 녹화·합성·모션 캡처가
  전부 물리 픽셀 2배(레티나급)로 수행된다. 기존 레코더의 dpr 인프라를 스키마로 노출
- **세대 손실 제거** — scenes 세그먼트는 준무손실(archive)로 인코딩하고
  최종 concat에서 1회만 손실 인코딩 (libx264 crf 16 slow)

### Changed
- `steps`는 `scenes`가 있으면 생략 가능 (없으면 기존대로 필수)
- 모션 템플릿 한글 폴백에 가짜 기울임 합성 금지(`font-synthesis: none`),
  비네트 캡션은 산세리프 정자로

---

## [0.8.0] - 2026-06-10

Zero-Footprint & Prepare — "내 repo를 더럽히지 않는 데모 도구". 모든 흔적은
`.clipwise/` 하나에 담기고, 데모를 위해 앱 코드를 수정하던 압력은 녹화 시
런타임 주입으로 대체된다. 설계 문서: `docs/research/design-introduce-pipeline.md`

### Added
- **`prepare:` 시스템** — 녹화 브라우저에만 적용되는 런타임 주입 (소스/빌드/DB 무접촉):
  - `hide:` — 쿠키 배너, dev 오버레이 등 셀렉터 목록을 CSS로 숨김
  - `mock:` — 네트워크 응답을 픽스처 JSON 또는 인라인 body로 대체 (URL 부분 문자열 매칭)
  - `freezeTime:` — `Date`/`Date.now()`를 ISO 8601 시각으로 동결
  - `seedRandom:` — `Math.random()`을 시드 기반 결정론적 PRNG(mulberry32)로 대체
  - `storage:` — 페이지 부팅 전 localStorage/sessionStorage 시드
  - `inject:` — 임의 CSS/JS 파일 주입
- **`install-skill --remove`** — 설치된 Claude Code 스킬의 대칭적 제거 경로
- **Brand Kit 스캐폴딩** — `init`이 `.clipwise/brand.yaml` 생성: 톤앤매너 프리셋(midnight/daylight/neon), accent, 캐치프레이즈, 폰트 프리셋(editorial/grotesk/system), 선 드로잉 강조 토글(annotations)
- **`deviceFrame.url`** — browser 크롬 주소창 표시 URL 옵션 + 크롬 리얼리즘 개선 (내비게이션 아이콘, 패드락 URL 필, 아바타)
- prepare 상대 경로(fixture, inject)는 시나리오 파일 위치 기준으로 해석
- public API: `applyPrepare`, `build*Script` 빌더, `resolvePreparePaths`, `PrepareConfig`/`MockRoute` 타입

### Changed
- **`clipwise init`** — 루트 `clipwise.yaml` 대신 `.clipwise/` 스캐폴딩 생성
  (scenarios/, prepare/, fixtures/, auth/ + 자동 .gitignore). `rm -rf .clipwise` 한 줄로 모든 흔적 제거
- **기본 출력 경로** — `./output` → `.clipwise/output` (BREAKING: outputDir을 명시하지 않은 시나리오의 출력 위치가 바뀜)
- **`record -o`** — 미지정 시 시나리오의 `outputDir`을 존중 (이전: 무조건 `./output`으로 덮어씀)
- README 설치 권장 — `npm install -D clipwise` → `npx clipwise@latest` (package.json 무수정)

---

## [0.7.2] - 2026-03-28

### Added
- **Authentication support** — `auth.storageState` (Playwright session file) and `auth.cookies` (inline cookie definitions) for recording login-required pages
- **`captureWhileWaiting`** — new option on all async wait actions (`waitForSelector`, `waitForNavigation`, `waitForURL`, `waitForFunction`, `waitForResponse`) to continuously capture frames during wait periods, with `displaySpeed` for auto-compression
- **`waitForConditionWithCapture()` helper** — shared repaint loop extracted from `smartWait`, eliminating code duplication

### Fixed
- **Keystroke HUD CJK text overflow** — Korean/Chinese/Japanese text now auto-wraps based on display width (CJK chars measured at 1.7× width); previously truncated or overflowed the HUD box
- **React controlled input compatibility** — `type` action now dispatches native `input`/`change` events after typing, ensuring React/Vue/Angular state updates

### Changed
- **Claude Code skill** synced with v0.7.0 features — added `smartWait`, `smartSpeed`, `easing: spring`, `output.codec`, auto loader detection, zoom sustain rules
- **Static pages** (EN/KO) — AI schema updated to v0.7.2 with auth, captureWhileWaiting, smartWait, smartSpeed, codec, easing fields

---

## [0.7.1] - 2026-03-28

### Changed
- **Demo video** — replaced 33MB repo-hosted GIF/MP4 with 3.57MB GitHub-hosted MP4 (`<video autoplay loop muted>`)
- **Demo site sync** — `docs/demo/index.html` synced with `examples/demo-site/dashboard.html` (hover effects, loading spinner)
- **Repo size** — removed `docs/demo.gif` (11MB) and `docs/demo.mp4` (22MB)

---

## [0.7.0] - 2026-03-28

### Added
- **Spring physics zoom** — `easing: spring` produces natural, Screen Studio-like camera motion with faster initial response and smooth deceleration
- **Zone-aware zoom continuity** — nearby clicks are merged into continuous zoom zones; no more jarring zoom-out/zoom-in between adjacent interactions
- **Focus point interpolation** — smooth panning between click targets within a zoom zone instead of instant jumps
- **Zoom sustain during typing** — zoom maintains throughout entire `type` action duration (periodic click refresh every 400ms)
- **`smartWait` action** — records real wait time (API calls, loading states), then auto-compresses in output; supports `networkIdle`, `selector`, and `domStable` conditions
- **`smartSpeed` effect** — content-aware speed control with ease-in/out transitions; compresses loading periods while keeping content at normal speed
- **Auto loader detection** — CDP `Animation.animationStarted` passively detects CSS spinners (`@keyframes spin/rotate/pulse/bounce`); auto-marks frames for smartSpeed compression
- **Dedup bypass during loading** — frame deduplication disabled during waiting/loading phases so spinner frames are preserved for fast-forward effect
- **AV1 codec support** — `output.codec: "av1"` with SVT-AV1 `scm=2` (Screen Content Mode) for 40-60% smaller files
- **Codec selection** — `output.codec: auto | h264 | hevc | av1`
- **Overlay descriptor pattern** — cursor/keystroke effects export `build*Overlay()` functions for batched Sharp composition

### Changed
- **Sharp pipeline batching** — 5 individual Sharp calls per frame → 1 batched `.composite([...])` call; **3× faster composition** (69 → 23 ms/frame)
- **Encoding quality** — `-tune stillimage` → `-tune animation` for sharper screen content; HEVC 10-bit (`yuv420p10le`) eliminates gradient banding; preset-aware x264 speed (`social: medium`, `balanced: slow`, `archive: veryslow`)
- **HEVC color metadata** — proper bt709 color primaries/transfer/colorspace tags for accurate playback

---

## [0.6.1] - 2026-03-09

### Fixed
- **Docs/Skill v0.6.0 alignment** — AI schema reference in static pages and Claude Code skill updated from v0.5.0 to v0.6.0 (was missing new transitions, audio narration, per-step effects override, smart camera)
- **KO static page zoom** — fixed outdated `scale: 1.8` → `intensity: light` in zoom effect card
- **KO keystroke HUD card** — added missing `showTyping` and `multi-session` tags (EN parity)
- **Skill file** — removed non-existent `macbook` device type, added 4 new critical rules (#8–#11)

### Changed
- **Section ordering** — Claude Code Skill moved higher in README (after Usage) and static pages (after Quick Start), following popular repo conventions (Prettier, ESLint, Tailwind)
- **Navigation links** in EN/KO static pages reordered to match new section flow

---

## [0.6.0] - 2026-03-07

### Added
- **Per-step effects override** — override any global effect on a per-step basis; unset properties inherit from global config
- **New transitions** — `slide-left`, `slide-up`, `blur` (in addition to `none` and `fade`)
- **Audio narration** — attach MP3/WAV audio to MP4 output with volume, fadeIn, fadeOut controls
- **Smart camera** — zoom automatically suppressed during scroll actions to avoid disorienting motion; `followCursor` pans focal point to cursor position (not just click targets)

### Changed
- **Gentler defaults** — zoom intensity default changed to `light` (1.25×, was `moderate`), cursor speed default changed to `normal` (~144ms, was `fast`)
- **Cursor trail/highlight** enabled by default

---

## [0.5.2] - 2026-03-03

### Added
- **Claude Code skill** — built-in skill file (`skills/clipwise.md`) for Claude Code integration
- **`install-skill` CLI command** — `npx clipwise install-skill` copies the skill to `.claude/skills/`

---

## [0.5.1] - 2026-03-01

### Fixed
- **Record command** now respects YAML `output.format` field correctly
- **Demo GIF** re-recorded in high quality

---

## [0.5.0] - 2026-02-28

### Added
- **Smooth cursor movement** — bezier interpolation with automatic CSS transition suppression for pixel-perfect cursor animation
- **Zoom intensity presets** — `subtle` (1.15×), `light` (1.25×), `moderate` (1.35×), `strong` (1.5×), `dramatic` (1.8×) replace raw numeric scale
- **Multi-session keystroke HUD** — each input field gets its own line (up to 3 recent sessions, oldest dimmed at top)
- **`showTyping` option** for keystroke HUD — industry-standard default shows shortcuts only; set `showTyping: true` to also show regular typed text

---

## [0.4.0] - 2026-02-26

### Added
- **Concurrent streaming pipeline** — recording and composition now run in parallel via `recordToChannel()`. On Apple M1 Max (10 cores), total wall time drops from ~128s to ~92s (−28%) for a 44s demo at 1280×800
- **Static frame deduplication** — identical consecutive CDP frames are dropped before composition (signature: first 2 KB). Reduces frame count by ~33% on typical demos (902 vs 1,303 frames), directly cutting composition time
- **StaticLayers cache per worker** — background, shadow, watermark SVGs and browser chrome PNG are pre-rasterised once per worker thread and reused across all frames, eliminating ~3 redundant Sharp calls per frame
- **Raw RGBA pipeline** — compose workers return raw RGBA buffers instead of re-encoding to PNG; FFmpeg and GIF encoder consume them directly, removing a full PNG encode/decode round-trip per frame
- **`sharp.concurrency(1)`** — prevents libvips from spawning additional threads inside each worker, avoiding CPU oversubscription with an 8-worker pool
- **New Beam Analytics demo** — redesigned built-in showcase (`beam.html`) with a clean product analytics dashboard, replacing the legacy Pulse Dashboard

### Fixed
- **Blank opening frames** — `startCapture()` was called before the first `navigate` action, recording browser startup and page-load frames into the video. Fixed: step 0's actions run first, then capture begins. Eliminates the ~5s static opener present in prior versions

### Performance (Apple M1 Max · 10 cores)

| Stage | v0.3.0 | v0.4.0 | Change |
|-------|--------|--------|--------|
| Recording | 30.8 s | 31.1 s | — |
| Compose + Encode | 97.2 s | 60.6 s | **−38%** |
| **Total** | **127.9 s** | **91.7 s** | **−28%** |
| ms / frame | 69 ms | 67 ms | −3% |
| Frames captured | 1,303 | 902 | −31% (dedup) |

---

## [0.3.0] - 2026-02-26

### Added
- **HEVC hardware encoding** — `hevc_videotoolbox` is now the preferred encoder on macOS, delivering better compression than H.264 with QuickTime-compatible `hvc1` tags
- **Revised quality presets** — `social` / `balanced` / `archive` now target real-world bitrates matching Twitter/portfolio/archival use cases respectively

### Changed
- **Quality presets raised to macOS screen recording parity** — `archive` preset now encodes at ~3.8 Mbps HEVC (≈ macOS native screen recording), `balanced` at ~1.3 Mbps; both within a ≤20 MB budget for a 44s demo
- **Encoder priority** updated to `hevc_videotoolbox` → `h264_videotoolbox` → `libx264`
- **Encoding strategy** switched from constant bitrate (`-b:v`) back to quality-based VBR (`-q:v`) — HEVC VBR is far more efficient for mostly-static screen content
- **Lossless source capture** — CDP screencast format changed from JPEG (quality 95) to PNG, eliminating DCT block artifacts that compounded through the multi-layer effects pipeline
- Default demo preset changed from `social` → `archive` to ship the best quality out of the box
- Recommended preset updated to `balanced` in docs

### Fixed
- **Critical: recorded content appeared at ~25% of frame size** — compose pipeline was computing `width = viewport × dpr = 2560` regardless of actual CDP capture resolution (headless Chrome always captures at CSS viewport size). Fixed by reading actual buffer dimensions via `sharp.metadata()` at the start of each frame
- **Cursor teleportation between positions** — `CURSOR_SPEED_PRESETS` step delays (previously 6–12 ms) were shorter than the CDP screencast ACK cycle (25 ms), causing multiple movement steps to collapse into a single captured frame. Delays raised to 22–25 ms so each bezier step lands in a distinct frame

### Performance
- **Parallel frame composition** using worker threads — `CanvasRenderer.composeAll` distributes frames across all CPU cores (measured ~473% CPU utilisation, −64% wall time vs single-threaded baseline)
- **FFmpeg stdin pipeline** — raw RGB24 frames streamed directly to FFmpeg via stdin; no temporary PNG files written to disk during MP4 encoding
- **Automatic VideoToolbox detection** — encoder probed once at startup, result cached for the recording lifetime

---

## [0.2.1] - 2026-02-25

### Added
- `waitForFunction` action — waits until a JavaScript expression evaluates to truthy (useful for AI streaming responses, dynamic content)
- `waitForResponse` action — waits for a network response matching a URL substring (pre-registered before the triggering action to avoid race conditions)
- `waitForSelector` / `waitForNavigation` / `waitForURL` actions — full suite of async wait primitives
- "Copy page for AI" floating button on docs site

### Fixed
- Resolved npm audit security vulnerabilities in dependencies

---

## [0.2.0] - 2026-02-25

### Added
- **Encoding preset system** — `preset: social | balanced | archive` replaces the `quality: 1–100` field for clearer, predictable output sizes
- `quality` field retained as a deprecated fallback (maps to nearest preset)

### Changed
- Improved default demo dashboard UI

---

## [0.1.2] - 2026-02-24

### Added
- Docs site (`docs/`) with GitHub Pages support
- AI-ready schema reference block with one-click copy
- Syntax highlighting via highlight.js

### Fixed
- White screen at recording start — wait for `requestAnimationFrame` × 2 after navigation before capturing first frame

---

## [0.1.1] - 2026-02-24

### Added
- Korean README (`README.ko.md`)
- Trendy dark dashboard demo site

### Fixed
- White screen bug on first frame of recording

---

## [0.1.0] - 2026-02-24

### Added
- Initial release
- YAML-driven screen recorder powered by Playwright CDP
- Effects: zoom (adaptive), cursor (trail, ripple, highlight), background (gradient/solid), device frame (browser, iPhone, iPad, Android), keystroke HUD, watermark, speed ramp
- Output formats: MP4, GIF, PNG sequence
- CLI: `record`, `demo`, `init`, `validate`
- Programmatic API: `ClipwiseRecorder`, `CanvasRenderer`, `encodeMp4`

[0.6.1]: https://github.com/kwakseongjae/clipwise/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kwakseongjae/clipwise/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/kwakseongjae/clipwise/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/kwakseongjae/clipwise/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/kwakseongjae/clipwise/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kwakseongjae/clipwise/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/kwakseongjae/clipwise/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/kwakseongjae/clipwise/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kwakseongjae/clipwise/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/kwakseongjae/clipwise/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kwakseongjae/clipwise/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kwakseongjae/clipwise/releases/tag/v0.1.0
