/**
 * Scene System E2E 스모크 (dev utility) — scenes YAML → dist CLI → MP4
 *
 * make-keynote.ts와 달리 엔진 경로(`clipwise record`)를 그대로 사용한다.
 * 사용자가 작성할 YAML과 동일한 표면으로 미니 키노트를 렌더해
 * v0.9 Scene System의 전 구간(스키마→검증→런너→CLI)을 검증한다.
 *
 * 실행: npx tsx scripts/smoke-scenes.ts   (사전: npm run build)
 * 산출: output/smoke-scenes.mp4
 */

import { createServer } from "http";
import { spawn } from "child_process";
import { readFile, writeFile, mkdir, mkdtemp, copyFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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

  const dir = await mkdtemp(join(tmpdir(), "clipwise-scenes-smoke-"));
  await mkdir(join(dir, "fixtures"));
  await writeFile(join(dir, "fixtures", "stats.json"), JSON.stringify({ revenue: "$128,400" }));

  const scenarioPath = join(dir, "mini-keynote.yaml");
  await writeFile(
    scenarioPath,
    `name: "Scenes Smoke"
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
  filename: smoke-scenes

scenes:
  - type: motion
    template: kinetic-type
    duration: 2000
    props: { lines: "Scenes, *declared.*", size: 82 }

  - type: screen
    id: demo
    steps:
      - name: "Open"
        captureDelay: 100
        holdDuration: 900
        actions:
          - action: navigate
            url: "http://localhost:${port}/"
            waitUntil: networkidle
      - name: "Ask"
        captureDelay: 50
        holdDuration: 400
        actions:
          - { action: click, selector: "#query" }
          - { action: type, selector: "#query", text: "Q3 vs forecast", delay: 24 }
      - name: "Analyze"
        captureDelay: 50
        holdDuration: 1400
        actions:
          - { action: click, selector: "#generate" }
          - { action: waitForSelector, selector: "#report[data-loaded=true]", captureWhileWaiting: true }

  - type: vignette
    footage: demo
    duration: 3600
    layout: hero
    num: "01"
    label: "엔진이 렌더한 비네트"
    caption: "YAML *선언*만으로 — 코드 없이"
    push: { from: 1.02, to: 1.09 }
    start: { step: 0, offset: 0.15 }

  - type: vignette
    footage: demo
    duration: 3800
    layout: crop
    num: "02"
    label: "Smart Speed"
    caption: "결과 리빌 — *셀렉터 실측* 크롭"
    crop: { selector: ".row2 .card:nth-child(2)", pad: 14 }
    push: { from: 1.04, to: 1 }
    start: { step: 2 }
    rate: 1.1
    fx:
      - { kind: circle, selector: "#revenue", delay: 2300 }

  - type: motion
    template: kinetic-type
    duration: 2200
    props: { lines: "*Clipwise*", size: 90, sub: "npx clipwise@latest init" }
`,
  );

  console.log("Rendering scenes timeline via dist CLI...");
  const t0 = Date.now();
  // execSync는 이벤트 루프를 블로킹해 이 프로세스의 벤치 서버가 응답하지
  // 못한다 — 반드시 비동기 spawn으로 실행
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "node",
      [resolve(ROOT, "dist/cli/index.js"), "record", scenarioPath, "-o", join(dir, "out")],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`CLI exited with code ${code}`)));
    child.on("error", reject);
  });
  server.close();

  await mkdir(resolve(ROOT, "output"), { recursive: true });
  await copyFile(join(dir, "out", "smoke-scenes.mp4"), resolve(ROOT, "output/smoke-scenes.mp4"));
  console.log(`\nOK: output/smoke-scenes.mp4 (${((Date.now() - t0) / 1000).toFixed(0)}s wall)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
