/**
 * Clipwise Introduce 영상 조립 데모 (v0.9 Scene System의 수동 프로토타입)
 *
 * 구성 (6 scenes):
 *   [인트로 타이틀] → [설명 01] → [대시보드 투어 (screen)]
 *   → [설명 02] → [AI 리포트 (screen)] → [아웃트로]
 *
 * Brand Kit (.clipwise/brand.yaml)이 영상 전체를 관통한다:
 *   tone(톤앤매너 프리셋) → 모션 신 팔레트 + 스크린 신 배경/브라우저 크롬
 *   catchphrases/chapters → 타이틀·챕터 카드 카피
 *
 * 실행:
 *   npx tsx scripts/make-introduce.ts            # brand.yaml의 tone으로 1개
 *   npx tsx scripts/make-introduce.ts neon       # 특정 tone으로 1개
 *   npx tsx scripts/make-introduce.ts all        # midnight/daylight/neon 3종
 *
 * 산출: output/clipwise-introduce-<tone>.mp4
 */

import { chromium } from "playwright";
import { createServer, type Server } from "http";
import { execSync } from "child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";

// dist/ 임포트 — frame-worker가 dist/를 참조 (CLAUDE.md)
import {
  loadScenario,
  ClipwiseRecorder,
  CanvasRenderer,
  encodeMp4Stream,
  encodeMp4,
  type OutputConfig,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FPS = 30;
const W = 1280;
const H = 800;

// ─── Brand Kit ───────────────────────────────────────────────────────────────

export type Tone = "midnight" | "daylight" | "neon";

interface Brand {
  product: string;
  tone: Tone;
  accent: string;
  catchphrases: { intro: string; introSub: string; outro: string; outroSub: string };
  chapters: { num: string; title: string; desc: string }[];
}

const DEFAULT_BRAND: Brand = {
  product: "Clipwise",
  tone: "midnight",
  accent: "#6366f1",
  catchphrases: {
    intro: "Zero-Footprint Recording",
    introSub: "앱 코드를 건드리지 않는 시네마틱 데모 — Clipwise v0.8",
    outro: "Clipwise",
    outroSub: "npx clipwise@latest init",
  },
  chapters: [
    { num: "01", title: "시네마틱 대시보드 투어", desc: "스프링 줌과 커서 추적이 자동으로 따라갑니다 — 후편집 없이." },
    { num: "02", title: "AI 리포트, 기다림 없이", desc: "로딩은 Smart Speed로 빠르게 감고, 결과는 또렷하게 보여줍니다." },
  ],
};

async function loadBrand(): Promise<Brand> {
  try {
    const raw = parseYaml(await readFile(resolve(ROOT, ".clipwise/brand.yaml"), "utf-8"));
    return {
      ...DEFAULT_BRAND,
      ...raw,
      catchphrases: { ...DEFAULT_BRAND.catchphrases, ...(raw.catchphrases ?? {}) },
      chapters: raw.chapters ?? DEFAULT_BRAND.chapters,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

/** tone → 스크린 신(녹화 영상)의 배경 그라데이션 + 브라우저 크롬 모드 */
const TONE_SCREEN: Record<Tone, { gradient: string; chromeDark: boolean }> = {
  midnight: {
    gradient: "linear-gradient(135deg, #13123a 0%, #2b1e5e 55%, #0f2150 100%)",
    chromeDark: true,
  },
  daylight: {
    gradient: "linear-gradient(135deg, #e9e4da 0%, #f4f0e8 50%, #dbe3ee 100%)",
    chromeDark: false,
  },
  neon: {
    gradient: "linear-gradient(135deg, #1a0b33 0%, #43125e 50%, #0d2155 100%)",
    chromeDark: true,
  },
};

// ─── Motion 신: deterministic seek 캡처 ──────────────────────────────────────

async function captureMotionScene(
  template: string,
  props: Record<string, string>,
  durationMs: number,
): Promise<{ buffer: Buffer; seconds: number }> {
  const totalFrames = Math.round((durationMs / 1000) * FPS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const templatePath = resolve(__dirname, "../templates/motion", `${template}.html`);
  const params = new URLSearchParams(props);
  await page.goto(`${pathToFileURL(templatePath).href}?${params}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const frames: { index: number; buffer: Buffer; timestamp: number }[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = (i / FPS) * 1000;
    await page.evaluate((time) => (window as unknown as { __clipwiseSeek: (t: number) => void }).__clipwiseSeek(time), t);
    frames.push({ index: i, buffer: await page.screenshot({ type: "png" }), timestamp: t });
  }
  await browser.close();

  const output: OutputConfig = {
    format: "mp4", width: W, height: H, fps: FPS, quality: 80,
    preset: "balanced", codec: "auto", outputDir: ".clipwise/output", filename: "motion",
  };
  return { buffer: await encodeMp4(frames, output), seconds: totalFrames / FPS };
}

// ─── Screen 신: Pulse 대시보드 실녹화 ────────────────────────────────────────

const SCENARIO_HEAD = (port: number, fixtureDir: string, brand: Brand, tone: Tone) => `
viewport: { width: ${W}, height: ${H} }

prepare:
  hide: ["#cookie-banner"]
  freezeTime: "2026-06-10T09:00:00Z"
  seedRandom: 42
  storage:
    localStorage:
      onboarding_done: "yes"
  mock:
    - url: "/api/stats"
      fixture: ${fixtureDir}/stats.json

effects:
  deviceFrame: { enabled: true, type: browser, darkMode: ${TONE_SCREEN[tone].chromeDark}, url: "app.pulse.io" }
  keystroke: { enabled: true, showTyping: true }
  smartSpeed: { enabled: true }
  zoom: { intensity: light, easing: spring }
  cursor: { speed: normal, trail: true, highlight: true }
  background:
    type: gradient
    value: "${TONE_SCREEN[tone].gradient}"
    padding: 56
    borderRadius: 16

output:
  format: mp4
  width: ${W}
  height: ${H}
  fps: ${FPS}
  preset: balanced
`;

const DEMO_A_STEPS = (port: number) => `
steps:
  - name: "Open dashboard"
    captureDelay: 120
    holdDuration: 1300
    actions:
      - action: navigate
        url: "http://localhost:${port}/"
        waitUntil: networkidle

  - name: "Scan KPIs"
    captureDelay: 50
    holdDuration: 700
    actions:
      - action: hover
        selector: ".kpi:nth-child(1)"

  - name: "Retention KPI"
    captureDelay: 50
    holdDuration: 800
    actions:
      - action: hover
        selector: ".kpi:nth-child(4)"

  - name: "Scroll to transactions"
    captureDelay: 80
    holdDuration: 600
    actions:
      - action: scroll
        y: 430
        smooth: true

  - name: "Inspect a payment"
    captureDelay: 50
    holdDuration: 1300
    actions:
      - action: click
        selector: "#txns tr:nth-child(4)"
`;

const DEMO_B_STEPS = (port: number) => `
steps:
  - name: "Open dashboard"
    captureDelay: 120
    holdDuration: 700
    actions:
      - action: navigate
        url: "http://localhost:${port}/"
        waitUntil: networkidle

  - name: "Ask Pulse"
    captureDelay: 50
    holdDuration: 400
    actions:
      - action: click
        selector: "#query"
      - action: type
        selector: "#query"
        text: "Compare Q3 revenue vs forecast"
        delay: 28

  - name: "Analyze"
    captureDelay: 50
    holdDuration: 1500
    actions:
      - action: click
        selector: "#generate"
      - action: waitForSelector
        selector: "#report[data-loaded=true]"
        captureWhileWaiting: true
        displaySpeed: 4

  - name: "Read insights"
    captureDelay: 50
    holdDuration: 1500
    actions:
      - action: hover
        selector: ".insights li:nth-child(2)"
`;

async function startServer(): Promise<{ server: Server; port: number }> {
  const pageHtml = await readFile(resolve(__dirname, "bench-assets/scorecard-page.html"), "utf-8");
  const server = createServer((req, res) => {
    if (req.url === "/api/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ revenue: "REAL-API (mock failed!)" }));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(pageHtml);
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  return { server, port: (server.address() as { port: number }).port };
}

async function recordScene(scenarioYaml: string, dir: string, name: string): Promise<{ buffer: Buffer; seconds: number }> {
  const scenarioPath = join(dir, `${name}.yaml`);
  await writeFile(scenarioPath, scenarioYaml);
  const scenario = await loadScenario(scenarioPath);

  const recorder = new ClipwiseRecorder();
  const session = await recorder.record(scenario);

  const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
  let composed = 0;
  const counting = (async function* () {
    for await (const f of renderer.composeStream(session.frames)) {
      composed++;
      yield f;
    }
  })();
  const buffer = await encodeMp4Stream(counting, scenario.output);
  return { buffer, seconds: composed / FPS };
}

// ─── 베리에이션 1개 빌드 ─────────────────────────────────────────────────────

async function buildVariation(brand: Brand, tone: Tone, port: number, dir: string, fixtureDir: string): Promise<string> {
  const toneProps = { tone, accent: brand.accent };
  const [ch1, ch2] = brand.chapters;

  console.log(`\n━━ Variation: ${tone} ━━`);
  console.log("  [1/6] Intro title card...");
  const intro = await captureMotionScene("intro-title",
    { ...toneProps, title: brand.catchphrases.intro, subtitle: brand.catchphrases.introSub }, 3000);

  console.log("  [2/6] Chapter 01 card...");
  const c1 = await captureMotionScene("feature-callout", { ...toneProps, ...ch1 }, 2400);

  console.log("  [3/6] Demo A — dashboard tour...");
  const demoA = await recordScene(
    `name: "Pulse Tour (${tone})"${SCENARIO_HEAD(port, fixtureDir, brand, tone)}${DEMO_A_STEPS(port)}`, dir, `demo-a-${tone}`);

  console.log("  [4/6] Chapter 02 card...");
  const c2 = await captureMotionScene("feature-callout", { ...toneProps, ...ch2 }, 2400);

  console.log("  [5/6] Demo B — AI report...");
  const demoB = await recordScene(
    `name: "Pulse AI (${tone})"${SCENARIO_HEAD(port, fixtureDir, brand, tone)}${DEMO_B_STEPS(port)}`, dir, `demo-b-${tone}`);

  console.log("  [6/6] Outro + timeline assembly...");
  const outro = await captureMotionScene("intro-title",
    { ...toneProps, title: brand.catchphrases.outro, subtitle: brand.catchphrases.outroSub }, 2600);

  const tmp = await mkdtemp(join(tmpdir(), `clipwise-scenes-${tone}-`));
  const segs = [intro, c1, demoA, c2, demoB, outro].map((s, i) => ({ path: join(tmp, `s${i}.mp4`), ...s }));
  for (const s of segs) await writeFile(s.path, s.buffer);

  const FADE = 0.35;
  const filters = segs
    .map((s, i) => {
      const chains = ["format=yuv420p"];
      if (i > 0) chains.push(`fade=t=in:st=0:d=${FADE}`);
      if (i < segs.length - 1) chains.push(`fade=t=out:st=${(s.seconds - FADE).toFixed(2)}:d=${FADE}`);
      return `[${i}:v]${chains.join(",")}[v${i}]`;
    })
    .join(";");
  const concatInputs = segs.map((_, i) => `[v${i}]`).join("");
  const outPath = resolve(ROOT, `output/clipwise-introduce-${tone}.mp4`);
  execSync(
    `ffmpeg -y ${segs.map((s) => `-i "${s.path}"`).join(" ")} ` +
      `-filter_complex "${filters};${concatInputs}concat=n=${segs.length}:v=1:a=0[v]" ` +
      `-map "[v]" -c:v libx264 -crf 18 -preset medium -movflags +faststart "${outPath}"`,
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const total = segs.reduce((s, x) => s + x.seconds, 0);
  const size = (await readFile(outPath)).length;
  console.log(`  → ${outPath} (${total.toFixed(1)}s, ${(size / 1024).toFixed(0)} KB)`);
  return outPath;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const brand = await loadBrand();
  const arg = process.argv[2] as Tone | "all" | undefined;
  const tones: Tone[] =
    arg === "all" ? ["midnight", "daylight", "neon"]
    : arg ? [arg]
    : [brand.tone];

  const { server, port } = await startServer();
  const dir = await mkdtemp(join(tmpdir(), "clipwise-introduce-"));
  await mkdir(join(dir, "fixtures"));
  await writeFile(
    join(dir, "fixtures", "stats.json"),
    JSON.stringify({
      revenue: "$128,400",
      insights: [
        "Q3 tracking 7.7% above forecast — annual-plan upgrades leading",
        "Enterprise segment grew 2.1× faster than self-serve",
        "Churn risk concentrated in Starter monthly — 3 accounts flagged",
      ],
    }),
  );

  await mkdir(resolve(ROOT, "output"), { recursive: true });
  const outputs: string[] = [];
  try {
    for (const tone of tones) {
      outputs.push(await buildVariation(brand, tone, port, dir, join(dir, "fixtures")));
    }
  } finally {
    server.close();
  }

  console.log(`\nDone — ${outputs.length} variation(s):`);
  for (const o of outputs) console.log(`  ${o}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
