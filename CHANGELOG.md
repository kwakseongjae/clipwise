# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/kwakseongjae/clipwise/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/kwakseongjae/clipwise/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kwakseongjae/clipwise/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/kwakseongjae/clipwise/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kwakseongjae/clipwise/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kwakseongjae/clipwise/releases/tag/v0.1.0
