# PlayShot

Playwright-based cinematic screen recorder for product demos. Write a YAML scenario, PlayShot records the browser via CDP, applies visual effects (cursor, zoom, device frames, backgrounds), and encodes to MP4/GIF.

## Quick Start

```bash
# Install
npm install -D playshot

# Try the built-in demo instantly
npx playshot demo

# Or create your own scenario
npx playshot init                              # Creates playshot.yaml template
# Edit playshot.yaml — change URL to your site
npx playshot record playshot.yaml -f mp4       # Record!
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
npx playshot demo                          # Browser frame, MP4
npx playshot demo --device iphone          # iPhone mockup
npx playshot demo --device android         # Android mockup
npx playshot demo --device ipad            # iPad mockup
npx playshot demo --url https://my-app.com # Your deployed site

# Record from YAML scenario
npx playshot record <scenario.yaml> -f mp4 -o ./output
npx playshot record <scenario.yaml> -f gif -o ./output

# Initialize a template
npx playshot init

# Validate without recording
npx playshot validate <scenario.yaml>

# Disable all effects (raw capture)
node dist/cli/index.js record <scenario.yaml> --no-effects -o ./output
```

### Programmatic API

```typescript
import { PlayShotRecorder, CanvasRenderer, encodeMp4, loadScenario } from "playshot";

const scenario = await loadScenario("my-scenario.yaml");
const recorder = new PlayShotRecorder();
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
  quality: 80              # 1-100 (MP4: maps to CRF)

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

| Action | Parameters | Description |
|--------|-----------|-------------|
| `navigate` | `url`, `waitUntil?` | Navigate to URL |
| `click` | `selector`, `delay?` | Click an element |
| `type` | `selector`, `text`, `delay?` | Type text (char-by-char) |
| `hover` | `selector` | Hover over element |
| `scroll` | `y?`, `x?`, `selector?`, `smooth?` | Scroll by offset |
| `wait` | `duration` | Wait (ms) |
| `screenshot` | `name?`, `fullPage?` | Capture marker |

**`waitUntil`** options: `"load"`, `"domcontentloaded"`, `"networkidle"` (default)

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

Custom cursor with click ripple, trail, and glow highlight.

```yaml
cursor:
  enabled: true
  size: 20
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
  text: "PlayShot"
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

## Output Compression

MP4 output uses `libx264` with `slow` preset and `animation` tuning for best quality-per-byte. The `quality` field maps to CRF:

| quality | CRF | Use case |
|---------|-----|----------|
| 90-100 | 0-5 | Lossless / archival |
| 70-85 | 8-15 | High quality demos |
| 50-70 | 15-26 | Web sharing |
| 30-50 | 26-36 | Small file size |

**Recommended**: `quality: 80` for most demos (CRF ~10, good visual quality, ~3-7 MB for 30s).

For further compression after export:

```bash
# Re-encode with tighter CRF
ffmpeg -i input.mp4 -c:v libx264 -crf 26 -preset slow -movflags +faststart output.mp4

# Convert to WebM (smaller, web-native)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm
```

## Examples

The `examples/` directory includes ready-to-run demos:

```bash
# Desktop browser demo (19 steps, ~30s)
node dist/cli/index.js record examples/demo.yaml -f mp4 -o ./output

# iPhone mockup demo (12 steps, ~28s)
node dist/cli/index.js record examples/demo-iphone.yaml -f mp4 -o ./output

# Android mockup demo (10 steps, ~26s)
node dist/cli/index.js record examples/demo-android.yaml -f mp4 -o ./output

# iPad mockup demo (13 steps, ~28s)
node dist/cli/index.js record examples/demo-ipad.yaml -f mp4 -o ./output
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
  quality: 80

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
node dist/cli/index.js record my-scenario.yaml -f mp4 -o ./output
```

### Tips

- Use CSS selectors (`#id`, `.class`, `[data-testid=...]`) for reliable targeting
- Start each interaction with enough scroll to make the target element visible
- Use `waitUntil: "networkidle"` for pages with API calls
- Keep `type.delay` at 15-25ms for a fast but readable typing effect
- Use `transition: fade` between major sections for cinematic cuts

## Hosting the Demo Site (GitHub Pages)

PlayShot includes a demo dashboard in `docs/index.html`. To host it on GitHub Pages:

1. Push this repo to GitHub
2. Go to **Settings > Pages**
3. Set source to **Deploy from a branch**, select `main`, folder `/docs`
4. Your demo will be live at `https://<username>.github.io/<repo>/`

Then anyone can record your demo site:

```bash
npx playshot demo --url https://username.github.io/repo/
```

## Security

- **Selector validation**: All CSS selectors in YAML are validated against a safe character allowlist to prevent injection
- **URL handling**: Only `http://`, `https://`, and `file://` schemes are accepted
- **Chromium sandbox**: Playwright runs Chromium with default sandboxing
- **No network access**: Recordings are processed locally — frames never leave your machine

## Development

```bash
npm install          # Install dependencies
npm run build        # Build with tsup
npm run typecheck    # Type check
npm test             # Run tests (vitest)
```

## License

MIT
