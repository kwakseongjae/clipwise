[English](./README.md) | [한국어](./README.ko.md)

# Clipwise

Scriptable cinematic screen recorder for product demos — YAML in, polished MP4 out. Powered by Playwright CDP.

<p align="center">
  <video src="https://kwakseongjae.github.io/clipwise/demo.mp4" autoplay loop muted playsinline width="100%"></video>
</p>

> *Generated with `npx clipwise demo` — zero config, one command.*

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
    transition: none        # none | fade
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
  scale: 1.8          # Peak zoom level (1-5)
  duration: 500        # Zoom animation ms
  autoZoom:
    followCursor: true
    maxScale: 2.0
    transitionDuration: 300
    padding: 200
```

### Cursor

Custom cursor with click ripple, trail, glow highlight, and speed control.

```yaml
cursor:
  enabled: true
  size: 20
  speed: "fast"        # fast (~72ms) | normal (~144ms) | slow (~288ms)
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

Displays typed keys at the bottom of the screen.

```yaml
keystroke:
  enabled: true
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
  idleSpeed: 3.0        # Skip factor for idle frames
  actionSpeed: 0.8      # Slow factor near clicks
```

## Performance

Measured on **Apple M1 Max (10 cores)** — Pulse Dashboard demo, 44s @ 30fps, 1280×800:

| Stage | v0.3.0 | v0.4.0 | Change |
|-------|--------|--------|--------|
| Recording | 30.8 s | 31.1 s | — |
| Compose + Encode | 97.2 s | 60.6 s | **−38%** |
| **Total** | **127.9 s** | **91.7 s** | **−28%** |
| ms / frame | 69 ms | 67 ms | −3% |
| Frames captured | 1,303 | 902 | −31% (dedup) |

Key optimisations in v0.4.0: concurrent streaming pipeline, static frame deduplication (~33% skipped), per-worker StaticLayers cache, and raw RGBA buffer pipeline.

## Output Compression

Use the `preset` field to control quality and file size:

```yaml
output:
  format: mp4
  fps: 30
  preset: social      # social | balanced | archive
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
- Use `transition: fade` between major sections for cinematic cuts

### Writing Scenarios with AI

See [PROMPTS.md](./PROMPTS.md) for a ready-to-use prompt template. Copy-paste it to ChatGPT or Claude with your site URL, and get a working YAML scenario back.

## GitHub Pages

Clipwise includes a documentation site and a live demo dashboard in the `docs/` folder. To host it:

1. Push to GitHub: `git push origin main`
2. Go to **Settings > Pages**
3. Set source to **Deploy from a branch**, select `main`, folder `/docs`
4. Docs go live at `https://kwakseongjae.github.io/clipwise/`
5. Demo dashboard at `https://kwakseongjae.github.io/clipwise/demo/`

Then anyone can record the demo site:

```bash
npx clipwise demo --url https://kwakseongjae.github.io/clipwise/demo/
```

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
