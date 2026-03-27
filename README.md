[English](./README.md) | [한국어](./README.ko.md)

# Clipwise

Scriptable cinematic screen recorder for product demos — YAML in, polished MP4 out. Powered by Playwright CDP.

<p align="center">
  <video src="https://github.com/user-attachments/assets/bfd3910d-3449-4d04-b95a-52bea1f16025" autoplay loop muted playsinline width="100%"></video>
</p>

> *Generated with `npx clipwise demo` — 1 YAML file, 239 lines, one command.*

## Quick Start

```bash
# Install
npm install -D clipwise

# Try the built-in demo instantly
npx clipwise demo

# Or create your own scenario
npx clipwise init                              # Creates clipwise.yaml template
# Edit clipwise.yaml — change URL to your site
npx clipwise record clipwise.yaml -f mp4       # Record!
```

## Requirements

- **Node.js** >= 18
- **ffmpeg** (for MP4 output)
- **Chromium** (auto-installed on first run via Playwright)

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg

# Windows
choco install ffmpeg
```

## Usage

### CLI Commands

```bash
# Instant demo — records the built-in dashboard showcase
npx clipwise demo                          # Browser frame, MP4
npx clipwise demo --device iphone          # iPhone mockup
npx clipwise demo --device android         # Android mockup
npx clipwise demo --device ipad            # iPad mockup
npx clipwise demo --url https://my-app.com # Your deployed site

# Record from YAML scenario
npx clipwise record <scenario.yaml> -f mp4 -o ./output
npx clipwise record <scenario.yaml> -f gif -o ./output

# Initialize a template
npx clipwise init

# Validate without recording
npx clipwise validate <scenario.yaml>
```

### Programmatic API

```typescript
import { ClipwiseRecorder, CanvasRenderer, encodeMp4, loadScenario } from "clipwise";

const scenario = await loadScenario("my-scenario.yaml");
const recorder = new ClipwiseRecorder();
const session = await recorder.record(scenario);

const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
const frames = await renderer.composeAll(session.frames);

const mp4 = await encodeMp4(frames, scenario.output);
```

## Claude Code Skill

Clipwise ships a built-in [Claude Code](https://claude.com/claude-code) skill. Once installed, type `/clipwise` in Claude Code to generate YAML scenarios, validate, and record — all through natural language.

### Install the skill

```bash
npx clipwise install-skill
```

This copies the skill file to `.claude/skills/clipwise.md` (project-level if `.claude/` exists, otherwise `~/.claude/skills/`).

### Usage

In any Claude Code session:

```
/clipwise
> Record a demo of my dashboard at http://localhost:3000
  — click the login button, type credentials, navigate to analytics
```

Claude will:
1. Generate a complete `clipwise.yaml` scenario
2. Run `npx clipwise validate` to check for errors
3. Run `npx clipwise record` to produce the MP4

### Update

Re-run `npx clipwise install-skill` after upgrading clipwise to get the latest skill.

## YAML Scenario Format

A scenario has 4 sections: metadata, effects, output, and steps.

```yaml
name: "My Demo"
description: "Optional description"

viewport:
  width: 1280    # Browser width (default: 1280)
  height: 800    # Browser height (default: 800)

effects:
  # See "Effects" section below

output:
  format: mp4              # gif | mp4 | png-sequence
  width: 1280
  height: 800
  fps: 30                  # 1-60
  preset: social           # social | balanced | archive

steps:
  - name: "Step name"
    actions:
      - action: navigate
        url: "https://example.com"
    captureDelay: 200       # ms to wait after actions
    holdDuration: 800       # ms to hold on result
    transition: none        # none | fade | slide-left | slide-up | blur
    effects:                # Per-step effects override (optional)
      zoom:
        enabled: false      # Disable zoom for this step only
```

### Actions

#### Basic Actions

| Action | Parameters | Default | Description |
|--------|-----------|---------|-------------|
| `navigate` | `url`, `waitUntil?` | `waitUntil: "networkidle"` | Navigate to URL |
| `click` | `selector`, `delay?`, `timeout?` | | Click an element |
| `type` | `selector`, `text`, `delay?`, `timeout?` | `delay: 50` | Type text (char-by-char) |
| `hover` | `selector`, `timeout?` | | Hover over element |
| `scroll` | `y?`, `x?`, `selector?`, `smooth?`, `timeout?` | `y: 0`, `x: 0`, `smooth: true` | Scroll by offset |
| `wait` | `duration` | | Wait (ms) |
| `screenshot` | `name?`, `fullPage?` | `fullPage: false` | Capture marker |

#### Async Wait Actions

| Action | Parameters | Default | Description |
|--------|-----------|---------|-------------|
| `waitForSelector` | `selector`, `state?`, `timeout?` | `state: "visible"`, `timeout: 15000` | Wait for element state |
| `waitForNavigation` | `waitUntil?`, `timeout?` | `waitUntil: "networkidle"`, `timeout: 15000` | Wait for page load |
| `waitForURL` | `url`, `timeout?` | `timeout: 15000` | Wait for URL match |
| `waitForFunction` | `expression`, `polling?`, `timeout?` | `polling: "raf"`, `timeout: 30000` | Wait for JS expression to be truthy |
| `waitForResponse` | `url`, `status?`, `timeout?` | `timeout: 30000` | Wait for network response (URL substring match) |
| `smartWait` | `until`, `selector?`, `timeout?`, `displaySpeed?` | `until: "networkIdle"`, `timeout: 30000`, `displaySpeed: 8` | Smart wait — records real wait, auto-speeds in output |

**`waitUntil`** options: `"load"`, `"domcontentloaded"`, `"networkidle"` (default)
**`state`** options: `"visible"` (default), `"attached"`, `"hidden"`
**`polling`** options: `"raf"` (requestAnimationFrame, default) or milliseconds (e.g. `500`)

#### Async Wait Examples

```yaml
# Wait for element to appear
- action: waitForSelector
  selector: ".result-panel"
  state: visible
  timeout: 20000

# Wait for AI streaming response to complete
- action: waitForFunction
  expression: "document.querySelector('.ai-response')?.dataset.done === 'true'"
  timeout: 60000

# Wait for API response
- action: waitForResponse
  url: "/api/chat/completions"
  status: 200
  timeout: 60000

# Wait for dynamic content length
- action: waitForFunction
  expression: "document.querySelector('.output')?.textContent?.length > 100"
  polling: 500
```

### Timing Tips

For snappy demos (~30 seconds):
- `captureDelay: 50-100` ms
- `holdDuration: 500-800` ms
- `type.delay: 15-25` ms per character

For slower, cinematic demos:
- `captureDelay: 200-400` ms
- `holdDuration: 1500-2500` ms
- `type.delay: 40-60` ms per character

## Effects

All effects are optional and have sensible defaults.

### Zoom

Adaptive zoom follows cursor and zooms in on click targets.

```yaml
zoom:
  enabled: true
  intensity: light     # subtle | light | moderate | strong | dramatic
                       # 1.15x  | 1.25x | 1.35x    | 1.5x   | 1.8x
  # scale: 1.25       # Override with a numeric value instead of intensity
  duration: 800        # Zoom animation ms
  easing: spring       # spring (natural) | ease-in-out (default)
  autoZoom:
    followCursor: true   # Viewport pans to follow cursor position
    transitionDuration: 300
    padding: 200
```

| Intensity | Scale | Best for |
|-----------|-------|----------|
| `subtle` | 1.15× | Dense UIs, large viewports |
| `light` | 1.25× | Loom-style gentle pull-in **(default)** |
| `moderate` | 1.35× | Balanced — Camtasia range |
| `strong` | 1.5× | Clear focus, some context sacrificed |
| `dramatic` | 1.8× | Maximum emphasis, sparse UIs only |

**Smart camera**: Zoom is automatically suppressed during scroll actions to avoid disorienting motion. When `followCursor` is enabled, the focal point smoothly pans to follow cursor position (not just click targets). **Zone-aware zoom** (v0.7.0) merges nearby clicks into continuous zoom zones — no more jarring zoom-out/zoom-in between adjacent interactions. **Spring easing** (`easing: spring`) produces natural, Screen Studio-like camera motion with faster initial response and smooth deceleration.

### Cursor

Custom cursor with click ripple, trail, glow highlight, and speed control.

```yaml
cursor:
  enabled: true
  size: 20
  speed: "normal"      # fast (~72ms) | normal (~144ms) | slow (~288ms)
  clickEffect: true
  clickColor: "rgba(59, 130, 246, 0.3)"
  trail: true
  trailLength: 6
  highlight: true
  highlightRadius: 35
```

### Background

Gradient/solid padding with rounded corners and shadow.

```yaml
background:
  type: gradient         # gradient | solid | image
  value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  padding: 48
  borderRadius: 14
  shadow: true
```

### Device Frame

Wraps the recording in a device mockup.

```yaml
deviceFrame:
  enabled: true
  type: browser          # browser | iphone | ipad | android | none
  darkMode: true
```

| Type | Description |
|------|-------------|
| `browser` | macOS browser chrome with traffic lights |
| `iphone` | iPhone 15 Pro with Dynamic Island + home bar |
| `ipad` | iPad Pro with front camera dot |
| `android` | Android generic with punch-hole camera |

### Keystroke HUD

Displays a HUD at the bottom of the screen showing what was typed. By default, only modifier+key shortcuts are shown (industry standard — same as Screen Studio, KeyCastr, ScreenFlow). Set `showTyping: true` to also show regular typed text.

When typing across multiple input fields, each field gets its own line in the HUD (up to 3 recent sessions, oldest dimmed at top, newest bright at bottom).

```yaml
keystroke:
  enabled: true
  showTyping: true       # show typed text (default: false — shortcuts only)
  position: bottom-center
  fontSize: 16
  fadeAfter: 1500
```

### Watermark

Text overlay at a corner.

```yaml
watermark:
  enabled: true
  text: "Clipwise"
  position: bottom-right
  opacity: 0.5
```

### Speed Ramp

Automatically slows down near clicks and speeds up idle sections.

```yaml
speedRamp:
  enabled: true
  idleSpeed: 2.0        # Skip factor for idle frames (default: 2.0)
  actionSpeed: 0.8      # Slow factor near clicks
```

### Smart Speed <sup>v0.7.0</sup>

Content-aware speed control. Automatically compresses loading/wait periods while keeping meaningful content at normal speed. Detects CSS loading spinners via CDP Animation domain — no configuration needed.

```yaml
effects:
  smartSpeed:
    enabled: true
    waitSpeed: 4            # Speed multiplier for wait/loading periods
    idleSpeed: 4            # Speed multiplier for idle frames
    transitionDuration: 500 # Ease-in/out duration (ms) — loader is visible before fast-forward

steps:
  - name: "Submit form"
    actions:
      - action: click
        selector: "#submit-btn"
      - action: smartWait          # Records real API wait, auto-compresses in output
        until: selector            # networkIdle | selector | domStable
        selector: ".success-toast"
        timeout: 30000
        displaySpeed: 4            # 4x fast-forward (spinner visibly spins faster)
```

**How it works**: `smartWait` records the actual wait (API calls, loading states) at full quality, then smartSpeed compresses those frames in the output. Loading spinners are **auto-detected** via CDP — frames during active `@keyframes spin/rotate/pulse` animations are automatically marked for compression.

### Transitions

Control how steps transition to each other.

```yaml
steps:
  - name: "Step 1"
    transition: fade        # none | fade | slide-left | slide-up | blur
    actions: [...]
```

| Transition | Description |
|------------|-------------|
| `none` | Hard cut (default) |
| `fade` | Cross-dissolve between steps |
| `slide-left` | Outgoing frame slides left, incoming slides in from right |
| `slide-up` | Outgoing frame slides up, incoming slides in from bottom |
| `blur` | Outgoing frame blurs out while cross-fading to incoming |

### Per-Step Effects Override

Override global effects on a per-step basis. Any effect property can be overridden — unset properties inherit from the global config.

```yaml
effects:
  zoom:
    enabled: true
    intensity: light

steps:
  - name: "Overview"
    effects:
      zoom:
        enabled: false      # No zoom for this step
    actions: [...]

  - name: "Detail view"
    effects:
      zoom:
        intensity: strong   # Extra zoom for this step only
    actions: [...]
```

### Audio Narration

Attach an audio file (MP3, WAV, etc.) to the output MP4.

```yaml
audio:
  file: "./narration.mp3"
  volume: 1.0              # 0.0 - 2.0 (default: 1.0)
  fadeIn: 0                 # Fade-in duration in seconds
  fadeOut: 0                # Fade-out duration in seconds
```

## Performance

Measured on **Apple M1 Max (10 cores)** — Pulse Dashboard demo, 44s @ 30fps, 1280×800:

| Stage | v0.3.0 | v0.4.0 | v0.5.0 | v0.6.0 | **v0.7.0** |
|-------|--------|--------|--------|--------|--------|
| Recording | 30.8 s | 31.1 s | 31.1 s | 31.1 s | 58.3 s¹ |
| Compose + Encode | 97.2 s | 60.6 s | 60.6 s | 60.6 s | **39.6 s** |
| **Total** | **127.9 s** | **91.7 s** | **91.7 s** | **91.7 s** | **97.8 s**¹ |
| Frames captured | 1,303 | 902 | 902 | 902 | 1,388 |
| **ms/frame** | **69** | **67** | **67** | **67** | **23** |

¹ v0.7.0 recording is longer due to more scenario steps (23 vs 20) and zoom-sustaining click events during typing. Compose throughput improved **3×** (69 → 23 ms/frame) via Sharp pipeline batching.

Key optimisations in v0.4.0: concurrent streaming pipeline, static frame deduplication (~33% skipped), per-worker StaticLayers cache, and raw RGBA buffer pipeline.

v0.5.0 focuses on **recording quality**: smooth cursor, zoom intensity presets, multi-session keystroke HUD.

v0.6.0 focuses on **convention alignment & expressiveness**: gentler defaults (light zoom, normal cursor speed), per-step effects override, new transitions (slide, blur), audio narration, and smart camera (scroll-aware zoom suppression + cursor-following focal point).

v0.7.0 focuses on **quality leap**: spring physics zoom, zone-aware zoom continuity, focus point interpolation, `smartWait` + content-aware `smartSpeed`, auto loader detection (CDP Animation), HEVC 10-bit encoding (`-tune animation`), AV1 codec support, and Sharp pipeline batching (5→1 calls/frame).

## Output Compression

Use the `preset` field to control quality and file size:

```yaml
output:
  format: mp4
  fps: 30
  preset: social      # social | balanced | archive
  codec: auto          # auto | h264 | hevc | av1
```

| Preset | libx264 CRF | HEVC VideoToolbox q:v | Target use case |
|--------|-------------|----------------------|-----------------|
| `social` | 22 | 60 | Twitter, LinkedIn, Loom-style sharing (~2-4 MB / 30s) |
| `balanced` | 18 | 70 | General purpose, portfolio sites (~4-6 MB / 30s) |
| `archive` | 13 | 80 | High-fidelity storage, source masters (uncapped) |

**Recommended**: `preset: balanced` for most demos.

> **Legacy**: `quality: 1-100` still works and maps to the nearest preset (`>= 75` → social, `>= 45` → balanced, `< 45` → archive). Prefer `preset` for clarity.

### macOS — Hardware Acceleration

On **Apple Silicon and Intel Mac**, Clipwise automatically uses `hevc_videotoolbox` (HEVC/H.265) for hardware-accelerated encoding. This delivers **~5–10× faster encoding** than software `libx264` with no setup required.

```
macOS (HEVC VideoToolbox)  →  ~3 min wall time for a 44s, 1280×800 demo
Linux / Windows            →  ~8–12 min wall time (libx264, same quality)
```

VideoToolbox is detected at runtime — no config needed. If VideoToolbox is unavailable, it falls back to `libx264` automatically.

For further compression after export:

```bash
# Re-encode with tighter settings
ffmpeg -i input.mp4 -c:v libx264 -crf 26 -preset slow -movflags +faststart output.mp4

# Convert to WebM (smaller, web-native)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm
```

## Writing Your Own Scenario

1. **Create your target page** — any URL (localhost, file://, or remote)

2. **Create a YAML file** with your steps:

```yaml
name: "My App Demo"
viewport:
  width: 1280
  height: 800

effects:
  deviceFrame:
    enabled: true
    type: browser
  background:
    padding: 48
    borderRadius: 14

output:
  format: mp4
  fps: 30
  preset: social    # social | balanced | archive

steps:
  - name: "Open app"
    captureDelay: 100
    holdDuration: 1000
    actions:
      - action: navigate
        url: "http://localhost:3000"
        waitUntil: networkidle

  - name: "Click login"
    captureDelay: 50
    holdDuration: 800
    actions:
      - action: click
        selector: "#login-btn"

  - name: "Type email"
    captureDelay: 50
    holdDuration: 600
    actions:
      - action: click
        selector: "input[name=email]"
      - action: type
        selector: "input[name=email]"
        text: "demo@example.com"
        delay: 20
```

3. **Record**:

```bash
npx clipwise record my-scenario.yaml -f mp4 -o ./output
```

### Tips

- Use CSS selectors (`#id`, `.class`, `[data-testid=...]`) for reliable targeting
- Start each interaction with enough scroll to make the target element visible
- Use `waitUntil: "networkidle"` for pages with API calls
- Keep `type.delay` at 15-25ms for a fast but readable typing effect
- Use `transition: fade` or `transition: blur` between major sections for cinematic cuts

### Writing Scenarios with AI

See [PROMPTS.md](./PROMPTS.md) for a ready-to-use prompt template. Copy-paste it to ChatGPT or Claude with your site URL, and get a working YAML scenario back.

## GitHub Pages

Clipwise includes a documentation site and a live demo dashboard in the `docs/` folder. To host it:

1. Push to GitHub: `git push origin main`
2. Go to **Settings > Pages**
3. Set source to **Deploy from a branch**, select `main`, folder `/docs`
4. Docs go live at `https://kwakseongjae.github.io/clipwise/`
5. Demo dashboard at `https://kwakseongjae.github.io/clipwise/demo/`

The built-in `npx clipwise demo` already points to this URL by default.

## Security

- **Selector validation**: All CSS selectors in YAML are validated against a safe character allowlist
- **URL handling**: Only `http://`, `https://`, and `file://` schemes are accepted
- **Chromium sandbox**: Playwright runs Chromium with default sandboxing
- **Local processing**: Recordings are processed locally — frames never leave your machine

## Development

```bash
npm install          # Install dependencies
npm run build        # Build with tsup
npm run typecheck    # Type check
npm test             # Run tests (vitest)
```

## License

MIT
