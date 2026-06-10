/**
 * Clipwise Keynote 영상 빌더 — v0.9 Scene System 엔진으로 렌더 (도그푸딩)
 *
 * 벤치 서버 + 픽스처만 준비하고, 연출은 전부 scenes YAML 선언으로 표현해
 * 엔진(renderScenesTimeline)에 맡긴다. 스레드(장면을 관통하는 연결 선),
 * 폰트 프리셋, 선 드로잉 주석은 엔진/템플릿이 자동 처리.
 *
 * 실행: npx tsx scripts/make-keynote.ts   (사전: npm run build)
 * 산출: output/clipwise-keynote.mp4
 */

import { createServer } from "http";
import { readFile, writeFile, mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { loadScenario, validateScenario, renderScenesTimeline } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCENES_YAML = (port: number) => `name: "Clipwise Keynote"
viewport: { width: 1280, height: 800, deviceScaleFactor: 2 }

prepare:
  hide: ["#cookie-banner"]
  freezeTime: "2026-06-10T09:00:00Z"
  seedRandom: 42
  storage: { localStorage: { onboarding_done: "yes" } }
  mock: [{ url: "/api/stats", fixture: ./fixtures/stats.json }]

effects:
  cursor: { enabled: true, clickEffect: true, highlight: false, trail: false }

output:
  format: mp4
  width: 1280
  height: 800
  fps: 30
  preset: balanced
  filename: clipwise-keynote

scenes:
  # ── 푸티지 테이크 (타임라인 미등장 — 비네트들이 인용) ──
  - type: screen
    id: demo
    steps:
      - name: "Open"
        captureDelay: 120
        holdDuration: 1400
        actions:
          - action: navigate
            url: "http://localhost:${port}/"
            waitUntil: networkidle
      - name: "KPI"
        captureDelay: 50
        holdDuration: 700
        actions:
          - { action: hover, selector: ".kpi:nth-child(1)" }
      - name: "Type"
        captureDelay: 50
        holdDuration: 500
        actions:
          - { action: click, selector: "#query" }
          - { action: type, selector: "#query", text: "Compare Q3 revenue vs forecast", delay: 26 }
      - name: "Analyze"
        captureDelay: 50
        holdDuration: 1600
        actions:
          - { action: click, selector: "#generate" }
          - { action: waitForSelector, selector: "#report[data-loaded=true]", captureWhileWaiting: true, displaySpeed: 4 }
      - name: "Insights"
        captureDelay: 50
        holdDuration: 1500
        actions:
          - { action: hover, selector: ".insights li:nth-child(2)" }

  # ── 타임라인 ──
  - type: motion
    template: kinetic-type
    duration: 2200
    props: { lines: "Ship *demos*,||not edits.", size: 86 }

  - type: vignette
    footage: demo
    duration: 4200
    layout: hero
    num: "01"
    label: "시네마틱 카메라"
    caption: "코드 수정 없이 녹화된 *실제 화면*입니다"
    push: { from: 1.02, to: 1.1 }
    start: { step: 0, offset: 0.15 }
    fx:
      - { kind: arrow, selector: ".row2 .card:nth-child(2)", delay: 2900 }

  - type: vignette
    footage: demo
    duration: 3600
    layout: crop
    num: "02"
    label: "Ask Pulse"
    caption: "*자연어로* 질문하면 —"
    crop: { selector: ".row2 .card:nth-child(2)", pad: 14, maxH: 250 }
    push: { from: 1, to: 1.06 }
    start: { step: 2 }
    fx:
      - { kind: circle, selector: "#query", delay: 2300 }

  - type: vignette
    footage: demo
    duration: 4200
    layout: crop
    num: "03"
    label: "Smart Speed"
    caption: "로딩은 빠르게 감고, *결과는 또렷하게*"
    crop: { selector: ".row2 .card:nth-child(2)", pad: 14 }
    push: { from: 1.05, to: 1 }
    start: { step: 3 }
    rate: 1.15
    fx:
      - { kind: circle, selector: "#revenue", delay: 2500 }

  - type: motion
    template: kinetic-type
    duration: 1900
    props: { lines: "앱 코드는,||*그대로.*", size: 80, fx: marker }

  - type: vignette
    footage: demo
    duration: 4400
    layout: split
    num: "04"
    label: "Prepare — 런타임 주입"
    caption: "쿠키 배너 숨김 · 시간 동결 · *데모 데이터 목킹*"
    code:
      - "prepare:"
      - "  hide: [\\"#cookie-banner\\"]"
      - "  freezeTime: \\"2026-06-10\\""
      - "  seedRandom: 42"
      - "  mock:"
      - "    - url: \\"/api/stats\\""
      - "      fixture: stats.json"
    start: { step: 0, offset: 0.15 }
    rate: 1.4

  - type: motion
    template: kinetic-type
    duration: 2800
    props: { lines: "*Clipwise*", size: 92, sub: "npx clipwise@latest init" }
`;

async function main() {
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
  const port = (server.address() as { port: number }).port;

  const dir = await mkdtemp(join(tmpdir(), "clipwise-keynote-"));
  await mkdir(join(dir, "fixtures"));
  await writeFile(join(dir, "fixtures", "stats.json"), JSON.stringify({
    revenue: "$128,400",
    insights: [
      "Q3 tracking 7.7% above forecast — annual-plan upgrades leading",
      "Enterprise segment grew 2.1× faster than self-serve",
      "Churn risk concentrated in Starter monthly — 3 accounts flagged",
    ],
  }));
  const scenarioPath = join(dir, "keynote.yaml");
  await writeFile(scenarioPath, SCENES_YAML(port));

  const scenario = await loadScenario(scenarioPath);
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    console.error("Scenario invalid:", validation.errors);
    process.exit(1);
  }

  console.log("Rendering keynote via Scene System engine...");
  const t0 = Date.now();
  const buffer = await renderScenesTimeline(scenario, dir, ({ scene, total, label }) => {
    console.log(scene === 0 ? `  footage: ${label}` : `  scene ${scene}/${total}: ${label}`);
  });
  server.close();

  await mkdir(resolve(ROOT, "output"), { recursive: true });
  const outPath = resolve(ROOT, "output/clipwise-keynote.mp4");
  await writeFile(outPath, buffer);
  console.log(`\nOK: ${outPath} (${(buffer.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(0)}s wall)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
