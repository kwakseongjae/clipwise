# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
