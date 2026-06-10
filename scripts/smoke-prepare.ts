/**
 * Prepare 시스템 런타임 스모크 테스트 (dev utility)
 *
 * 검증 항목 — 전부 실제 ClipwiseRecorder 녹화 경로로 확인:
 *   hide        — 쿠키 배너가 프레임에서 사라지는가
 *   freezeTime  — 페이지의 new Date()가 고정 시각인가
 *   seedRandom  — Math.random()이 시드 기반 결정론인가 (2회 녹화 비교)
 *   storage     — localStorage 시드가 페이지 부팅 전에 적용되는가
 *   mock        — fetch("/api/stats")가 픽스처로 대체되는가
 *
 * 실행: npx tsx scripts/smoke-prepare.ts
 * 산출: output/smoke-prepare.png (마지막 프레임 — 육안 확인용)
 */

import { createServer } from "http";
import { mkdtemp, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { ClipwiseRecorder } from "../src/core/recorder.js";
import { loadScenario } from "../src/script/parser.js";

const PAGE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font: 24px/1.8 monospace; padding: 60px; background: #111; color: #eee; }
  #cookie-banner { position: fixed; top: 0; left: 0; right: 0; padding: 20px;
    background: #c00; color: #fff; text-align: center; font-weight: bold; }
  .value { color: #6ee7b7; }
</style></head><body>
  <div id="cookie-banner">COOKIE BANNER — prepare.hide가 동작하면 보이지 않아야 함</div>
  <div>date: <span class="value" id="date">-</span></div>
  <div>random: <span class="value" id="random">-</span></div>
  <div>storage: <span class="value" id="storage">-</span></div>
  <div>stats: <span class="value" id="stats">-</span></div>
  <script>
    document.getElementById("date").textContent = new Date().toISOString();
    document.getElementById("random").textContent =
      [Math.random(), Math.random()].map((v) => v.toFixed(6)).join(", ");
    document.getElementById("storage").textContent =
      localStorage.getItem("onboarding_done") ?? "(not set)";
    fetch("/api/stats").then((r) => r.json()).then((d) => {
      const el = document.getElementById("stats");
      el.textContent = d.revenue;
      el.dataset.loaded = "true";
    });
  </script>
</body></html>`;

async function recordOnce(scenarioPath: string) {
  const recorder = new ClipwiseRecorder();
  const scenario = await loadScenario(scenarioPath);
  const session = await recorder.record(scenario);
  return session.frames[session.frames.length - 1].screenshot;
}

async function main() {
  // 1. 검증 페이지 서버 (mock 대상인 /api/stats는 일부러 진짜 응답도 제공 —
  //    mock이 동작하지 않으면 "REAL-API"가 찍혀서 실패가 눈에 보인다)
  const server = createServer((req, res) => {
    if (req.url === "/api/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ revenue: "REAL-API (mock failed!)" }));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE_HTML);
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  // 2. 시나리오 + 픽스처 (임시 디렉토리 — 상대 경로 해석도 함께 검증)
  const dir = await mkdtemp(join(tmpdir(), "clipwise-smoke-"));
  await mkdir(join(dir, "fixtures"));
  await writeFile(
    join(dir, "fixtures", "stats.json"),
    JSON.stringify({ revenue: "$128,400 (fixture)" }),
  );
  const scenarioPath = join(dir, "scenario.yaml");
  await writeFile(
    scenarioPath,
    `name: "Prepare Smoke"
prepare:
  hide: ["#cookie-banner"]
  freezeTime: "2026-06-10T09:00:00Z"
  seedRandom: 42
  storage:
    localStorage:
      onboarding_done: "yes-from-prepare"
  mock:
    - url: "/api/stats"
      fixture: ./fixtures/stats.json
output:
  fps: 10
steps:
  - name: "Open"
    holdDuration: 400
    actions:
      - action: navigate
        url: "http://localhost:${port}/"
      - action: waitForSelector
        selector: "#stats[data-loaded=true]"
`,
  );

  // 3. 2회 녹화 — seedRandom 결정론은 마지막 프레임 바이트 비교로 검증
  console.log("Recording pass 1...");
  const frame1 = await recordOnce(scenarioPath);
  console.log("Recording pass 2...");
  const frame2 = await recordOnce(scenarioPath);
  server.close();

  const identical = frame1.equals(frame2);
  console.log(`\nDeterminism (freezeTime + seedRandom): frames ${identical ? "IDENTICAL ✓" : "DIFFER ✗"}`);

  const outPath = resolve("output", "smoke-prepare.png");
  await mkdir(resolve("output"), { recursive: true });
  await writeFile(outPath, frame1);
  console.log(`Last frame saved: ${outPath}`);
  console.log("육안 확인: 배너 없음 / date=2026-06-10T09:00:00.000Z / storage=yes-from-prepare / stats=$128,400 (fixture)");

  if (!identical) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
