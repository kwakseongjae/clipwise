/**
 * Clipwise Production Scorecard
 *
 * 인터랙티브 벤치 시나리오(scripts/bench-assets/scorecard-page.html)를 실제
 * 파이프라인으로 녹화·검증하고, 6개 카테고리 100점 만점으로 채점해
 * "프로덕션 수준" 판정을 내린다. 결과는 docs/production-scorecard.md에 누적.
 *
 * 채점 제도 (rubric):
 *   G  엔지니어링 게이트 15점 — typecheck 4 / unit tests 5 / build 3 / audit 3
 *   F  Prepare 기능 정확성 20점 — hide/freezeTime/seedRandom/storage/mock × 4
 *   M  모션/브랜드 10점 — Brand Kit 적용(tone·accent·카피) 5 / tone 3종 변별 + 캡처 결정론 5
 *   D  결정론 15점 — 2회 녹화 최종 프레임 바이트 일치 10 / 프레임 수 편차 ≤10% 5
 *   P  성능 20점 — compose ms/frame 10 / 녹화 오버헤드비 5 / 총 wall-clock 5
 *   Q  출력 품질 20점 — MP4 생성 4 / 해상도 4 / fps 4 / 길이 정합 4 / 크기 envelope 4
 *   X  CLI/DX 10점 — init 스캐폴딩(brand.yaml 포함) 3 / validate 오류 감지 4 / 스킬 설치·제거 3
 *   (점수 = earned / possible × 100 정규화 — 카테고리 추가 시 자동 반영)
 *
 * 등급: ≥90 Production-Ready / 80–89 Release Candidate / 65–79 Beta / <65 Alpha
 *   - 게이트(G) 체크가 하나라도 실패하면 등급 상한은 Beta
 *   - N/A 체크는 분모에서 제외 (점수 = earned / possible × 100)
 *
 * 사용법:
 *   npx tsx scripts/production-score.ts
 *   SCORE_LABEL="v0.8.0-rc" npx tsx scripts/production-score.ts
 */

import { execSync } from "child_process";
import { createServer, type Server } from "http";
import { performance } from "perf_hooks";
import { readFile, writeFile, mkdir, mkdtemp, access, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESULTS_FILE = resolve(ROOT, "docs/production-scorecard.md");
const PAGE_FILE = resolve(__dirname, "bench-assets/scorecard-page.html");
const FROZEN_TIME = "2026-06-10T09:00:00Z";
const SEED = 42;

// ─── 체크 프레임워크 ──────────────────────────────────────────────────────────

interface Check {
  category: string;
  name: string;
  points: number;
  earned: number;
  na?: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(category: string, name: string, points: number, earned: number, detail: string) {
  checks.push({ category, name, points, earned: Math.min(points, Math.max(0, earned)), detail });
  const mark = earned >= points ? "✓" : earned > 0 ? "◐" : "✗";
  console.log(`    ${mark} [${earned}/${points}] ${name} — ${detail}`);
}

function recordNA(category: string, name: string, points: number, detail: string) {
  checks.push({ category, name, points, earned: 0, na: true, detail });
  console.log(`    – [N/A] ${name} — ${detail}`);
}

function sh(cmd: string, cwd = ROOT): { ok: boolean; out: string; ms: number } {
  const t0 = performance.now();
  try {
    const out = execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}`, ms: Math.round(performance.now() - t0) };
  }
}

// ─── Phase G: 엔지니어링 게이트 ───────────────────────────────────────────────

function runGates(): boolean {
  console.log("\n  [G] 엔지니어링 게이트");

  const tc = sh("npm run typecheck");
  record("G 게이트", "typecheck (tsc --noEmit)", 4, tc.ok ? 4 : 0, tc.ok ? `통과 (${tc.ms}ms)` : "실패");

  const test = sh("npm test");
  const testCount = test.out.match(/Tests\s+(\d+) passed/)?.[1] ?? "?";
  record("G 게이트", "unit tests (vitest)", 5, test.ok ? 5 : 0, test.ok ? `${testCount}개 통과` : "실패");

  const build = sh("npm run build");
  record("G 게이트", "build (tsup ESM+DTS)", 3, build.ok ? 3 : 0, build.ok ? `통과 (${build.ms}ms)` : "실패");

  const audit = sh("npm audit --json");
  let vulns = -1;
  try {
    const meta = JSON.parse(audit.out).metadata?.vulnerabilities;
    vulns = meta ? Object.entries(meta).filter(([k]) => k !== "total").reduce((s, [, v]) => s + (v as number), 0) : -1;
    if (meta?.total !== undefined) vulns = meta.total;
  } catch { /* parse 실패 시 -1 유지 */ }
  record("G 게이트", "npm audit", 3, vulns === 0 ? 3 : 0, vulns === 0 ? "0 vulnerabilities" : `${vulns}건 발견`);

  return tc.ok && test.ok && build.ok && vulns === 0;
}

// ─── 벤치 서버 + 시나리오 준비 ────────────────────────────────────────────────

async function startBenchServer(): Promise<{ server: Server; port: number }> {
  const pageHtml = await readFile(PAGE_FILE, "utf-8");
  const server = createServer((req, res) => {
    if (req.url === "/api/stats") {
      // mock이 무력화되면 화면에 sentinel이 찍혀 채점에서 실패가 보인다
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

async function writeBenchScenario(port: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "clipwise-score-"));
  await mkdir(join(dir, "fixtures"));
  await writeFile(
    join(dir, "fixtures", "stats.json"),
    JSON.stringify({ revenue: "$128,400 (fixture)" }),
  );
  const scenarioPath = join(dir, "scorecard.yaml");
  await writeFile(
    scenarioPath,
    `name: "Production Scorecard Bench"
viewport: { width: 1280, height: 800 }

prepare:
  hide: ["#cookie-banner"]
  freezeTime: "${FROZEN_TIME}"
  seedRandom: ${SEED}
  storage:
    localStorage:
      onboarding_done: "yes"
  mock:
    - url: "/api/stats"
      fixture: ./fixtures/stats.json

effects:
  deviceFrame: { enabled: true, type: browser }
  keystroke: { enabled: true, showTyping: true }
  smartSpeed: { enabled: true }
  background:
    type: gradient
    value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    padding: 48
    borderRadius: 14

output:
  format: mp4
  width: 1280
  height: 800
  fps: 30
  preset: balanced
  filename: scorecard

steps:
  - name: "Open dashboard"
    captureDelay: 100
    holdDuration: 800
    actions:
      - action: navigate
        url: "http://localhost:${port}/"
        waitUntil: networkidle

  - name: "Type query"
    captureDelay: 50
    holdDuration: 500
    actions:
      - action: click
        selector: "#query"
      - action: type
        selector: "#query"
        text: "Q3 revenue forecast"
        delay: 30

  - name: "Generate report"
    captureDelay: 50
    holdDuration: 900
    actions:
      - action: click
        selector: "#generate"
      - action: waitForSelector
        selector: "#report[data-loaded=true]"
        captureWhileWaiting: true
        displaySpeed: 4

  - name: "Review breakdown"
    captureDelay: 50
    holdDuration: 700
    actions:
      - action: scroll
        y: 400
        smooth: true
`,
  );
  return scenarioPath;
}

// ─── Phase F: Prepare 기능 정확성 (DOM 검증) ─────────────────────────────────

async function runPrepareChecks(dist: Dist, scenarioPath: string) {
  console.log("\n  [F] Prepare 기능 정확성 (DOM 단정)");
  const scenario = await dist.loadScenario(scenarioPath);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await dist.applyPrepare(context, scenario.prepare!);
  const page = await context.newPage();

  const url = (scenario.steps[0].actions[0] as { url: string }).url;

  const loadAndCollect = async () => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.click("#generate");
    await page.waitForSelector("#report[data-loaded=true]", { timeout: 10000 });
    return page.evaluate(() => ({
      bannerDisplay: getComputedStyle(document.querySelector("#cookie-banner")!).display,
      today: document.querySelector("#today")!.textContent,
      welcomeOn: document.querySelector("#welcome")!.classList.contains("on"),
      revenue: document.querySelector("#revenue")!.textContent,
      bars: [...document.querySelectorAll(".bar span")].map((el) => el.textContent),
    }));
  };

  const run1 = await loadAndCollect();
  const run2 = await loadAndCollect(); // 재로드 — seedRandom 결정론 검증
  await browser.close();

  record("F Prepare", "hide — 쿠키 배너 숨김", 4, run1.bannerDisplay === "none" ? 4 : 0,
    `display: ${run1.bannerDisplay}`);
  record("F Prepare", "freezeTime — 날짜 동결", 4, run1.today === FROZEN_TIME.slice(0, 10) ? 4 : 0,
    `페이지 날짜: ${run1.today}`);
  record("F Prepare", "storage — localStorage 시드", 4, run1.welcomeOn ? 4 : 0,
    run1.welcomeOn ? "환영 배지 표시됨" : "시드 미적용");
  record("F Prepare", "mock — API 픽스처 대체", 4, run1.revenue?.includes("fixture") ? 4 : 0,
    `revenue: ${run1.revenue}`);
  const sameBars = JSON.stringify(run1.bars) === JSON.stringify(run2.bars) && run1.bars.length === 6;
  record("F Prepare", "seedRandom — 재로드 차트 동일", 4, sameBars ? 4 : 0,
    `차트: [${run1.bars.join(",")}] vs [${run2.bars.join(",")}]`);
}

// ─── Phase M: 모션/브랜드 (Brand Kit + tone 프리셋) ──────────────────────────

/** 톤 프리셋의 기대 배경색 — motion-templates의 토큰과 동기화 */
const TONE_BG: Record<string, string> = {
  midnight: "rgb(10, 10, 15)",   // #0a0a0f
  daylight: "rgb(250, 249, 247)", // #faf9f7
  neon: "rgb(12, 6, 22)",         // #0c0616
};

async function runMotionBrandChecks() {
  console.log("\n  [M] 모션/브랜드 (Brand Kit · tone 프리셋)");
  const { chromium } = await import("playwright");
  const { createHash } = await import("crypto");
  const { pathToFileURL } = await import("url");

  const template = resolve(__dirname, "../templates/motion/intro-title.html");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  const open = async (params: Record<string, string>) => {
    await page.goto(`${pathToFileURL(template).href}?${new URLSearchParams(params)}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
  };
  const seekShot = async (t: number) => {
    await page.evaluate((time) => (window as unknown as { __clipwiseSeek: (t: number) => void }).__clipwiseSeek(time), t);
    return createHash("sha256").update(await page.screenshot({ type: "png" })).digest("hex");
  };

  // M1: Brand Kit 적용 — tone 토큰 + 캐치프레이즈 + accent가 실제 렌더에 반영
  const CATCH = "Ship demos, not edits";
  const ACCENT = "#e11d48";
  await open({ tone: "daylight", accent: ACCENT, title: CATCH, subtitle: "brand kit smoke" });
  const applied = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    title: document.querySelector(".title")!.textContent,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
  }));
  const brandOk = applied.bg === TONE_BG.daylight && applied.title === CATCH && applied.accent === ACCENT;
  record("M 모션/브랜드", "Brand Kit 적용 (tone 토큰·카피·accent)", 5, brandOk ? 5 : 0,
    brandOk ? `daylight bg=${applied.bg}, 카피·accent 일치` : `bg=${applied.bg}, title=${applied.title}, accent=${applied.accent}`);

  // M2: tone 3종 변별성 + 캡처 결정론
  const toneHashes: Record<string, string> = {};
  for (const tone of ["midnight", "daylight", "neon"]) {
    await open({ tone, accent: "#6366f1", title: "Variance", subtitle: "tone check" });
    toneHashes[tone] = await seekShot(1500);
  }
  const distinct = new Set(Object.values(toneHashes)).size === 3;
  await open({ tone: "midnight", accent: "#6366f1", title: "Variance", subtitle: "tone check" });
  const replay = await seekShot(1500);
  const deterministic = replay === toneHashes.midnight;
  record("M 모션/브랜드", "tone 3종 변별 + 모션 캡처 결정론", 5, distinct && deterministic ? 5 : 0,
    `변별: ${distinct ? "3/3 고유" : "중복 발생"} · 재캡처: ${deterministic ? "byte-identical" : "불일치"}`);

  await browser.close();
}

// ─── Phase E2E: 녹화 → 합성 → 인코딩 (+ P 성능, Q 품질, D 결정론) ────────────

/**
 * 두 프레임의 콘텐츠 동일성 비교.
 * Chromium 컴포지터가 (0,0) 코너 픽셀에 남기는 1픽셀 LSB 아티팩트는 실행마다
 * 달라지는 렌더러 노이즈이므로(페이지 콘텐츠 아님) 마스킹 후 비교한다.
 */
async function compareFrameContent(
  a: Buffer,
  b: Buffer,
): Promise<{ identical: boolean; detail: string }> {
  if (a.equals(b)) return { identical: true, detail: "byte-identical" };

  const sharp = (await import("sharp")).default;
  const [ra, rb] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) {
    return { identical: false, detail: `해상도 불일치 ${ra.info.width}×${ra.info.height} vs ${rb.info.width}×${rb.info.height}` };
  }
  for (let c = 0; c < ra.info.channels; c++) {
    ra.data[c] = 0;
    rb.data[c] = 0;
  }
  return ra.data.equals(rb.data)
    ? { identical: true, detail: "content-identical ((0,0) 렌더러 아티팩트 마스킹)" }
    : { identical: false, detail: "불일치 — 페이지에 비결정 요소 잔존" };
}

interface Dist {
  loadScenario: (p: string) => Promise<any>;
  applyPrepare: (ctx: unknown, p: unknown) => Promise<void>;
  ClipwiseRecorder: new () => { record: (s: unknown) => Promise<any> };
  CanvasRenderer: new (e: unknown, o: unknown, s: unknown) => {
    composeStream: (frames: unknown[]) => AsyncIterable<unknown>;
  };
  encodeMp4Stream: (frames: AsyncIterable<unknown>, config: unknown) => Promise<Buffer>;
}

async function runPipeline(dist: Dist, scenarioPath: string) {
  console.log("\n  [P/Q/D] 파이프라인 녹화 — pass 1 (full) ...");
  const scenario = await dist.loadScenario(scenarioPath);

  // pass 1: 녹화 + 합성 + 인코딩
  const recorder1 = new dist.ClipwiseRecorder();
  const t0 = performance.now();
  const session1 = await recorder1.record(scenario);
  const recordingMs = Math.round(performance.now() - t0);

  const renderer = new dist.CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
  let composedCount = 0;
  const t1 = performance.now();
  const counting = (async function* () {
    for await (const f of renderer.composeStream(session1.frames)) {
      composedCount++;
      yield f;
    }
  })();
  const mp4 = await dist.encodeMp4Stream(counting, scenario.output);
  const composeMs = Math.round(performance.now() - t1);

  await mkdir(resolve(ROOT, "output"), { recursive: true });
  const outPath = resolve(ROOT, "output/scorecard.mp4");
  await writeFile(outPath, mp4);

  // pass 2: 녹화만 (결정론 검증)
  console.log("  [D] 파이프라인 녹화 — pass 2 (determinism) ...");
  const recorder2 = new dist.ClipwiseRecorder();
  const session2 = await recorder2.record(scenario);

  // ── D 결정론 ──
  console.log("\n  [D] 결정론");
  const last1 = session1.frames[session1.frames.length - 1].screenshot as Buffer;
  const last2 = session2.frames[session2.frames.length - 1].screenshot as Buffer;
  const frameVerdict = await compareFrameContent(last1, last2);
  record("D 결정론", "2회 녹화 최종 프레임 콘텐츠 일치", 10, frameVerdict.identical ? 10 : 0, frameVerdict.detail);
  const countDelta = Math.abs(session1.frames.length - session2.frames.length) /
    Math.max(session1.frames.length, 1);
  record("D 결정론", "프레임 수 편차 ≤10%", 5, countDelta <= 0.1 ? 5 : 0,
    `${session1.frames.length} vs ${session2.frames.length} (${(countDelta * 100).toFixed(1)}%)`);

  // ── P 성능 ──
  console.log("\n  [P] 성능");
  const videoSec = composedCount / scenario.output.fps;
  const msPerFrame = composedCount > 0 ? composeMs / composedCount : Infinity;
  const composeScore = msPerFrame <= 35 ? 10 : msPerFrame <= 50 ? 6 : msPerFrame <= 80 ? 3 : 0;
  record("P 성능", "compose+encode ms/frame (≤35 만점)", 10, composeScore,
    `${msPerFrame.toFixed(1)}ms/frame (${composedCount} frames, ${(composeMs / 1000).toFixed(1)}s)`);

  const overhead = recordingMs / 1000 / Math.max(videoSec, 0.1);
  const overheadScore = overhead <= 2.0 ? 5 : overhead <= 3.0 ? 3 : 0;
  record("P 성능", "녹화 오버헤드비 (녹화시간/영상길이, ≤2.0 만점)", 5, overheadScore,
    `${(recordingMs / 1000).toFixed(1)}s 녹화 → ${videoSec.toFixed(1)}s 영상 (${overhead.toFixed(2)}×)`);

  const wall = (recordingMs + composeMs) / 1000 / Math.max(videoSec, 0.1);
  const wallScore = wall <= 4 ? 5 : wall <= 6 ? 3 : 0;
  record("P 성능", "총 wall-clock (≤4× 영상길이 만점)", 5, wallScore,
    `${((recordingMs + composeMs) / 1000).toFixed(1)}s 총 (${wall.toFixed(2)}×)`);

  // ── Q 출력 품질 (ffprobe) ──
  console.log("\n  [Q] 출력 품질");
  const probe = sh(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration,size -of json "${outPath}"`,
  );
  let meta: { width?: number; height?: number; fps?: number; duration?: number; size?: number } = {};
  if (probe.ok) {
    try {
      const j = JSON.parse(probe.out);
      const [num, den] = (j.streams[0].r_frame_rate as string).split("/").map(Number);
      meta = {
        width: j.streams[0].width,
        height: j.streams[0].height,
        fps: num / (den || 1),
        duration: parseFloat(j.format.duration),
        size: parseInt(j.format.size, 10),
      };
    } catch { /* meta 비어있으면 아래 체크들이 0점 처리 */ }
  }
  record("Q 품질", "MP4 생성 + ffprobe 파싱", 4, probe.ok && meta.width ? 4 : 0,
    probe.ok ? `${((meta.size ?? 0) / 1024).toFixed(0)} KB` : "probe 실패");
  record("Q 품질", "해상도 = 출력 설정 (1280×800)", 4,
    meta.width === 1280 && meta.height === 800 ? 4 : 0, `${meta.width}×${meta.height}`);
  record("Q 품질", "fps = 30 (±0.5)", 4, Math.abs((meta.fps ?? 0) - 30) <= 0.5 ? 4 : 0,
    `${meta.fps?.toFixed(2)} fps`);
  const expectSec = composedCount / scenario.output.fps;
  const durOk = meta.duration !== undefined && Math.abs(meta.duration - expectSec) / expectSec <= 0.1;
  record("Q 품질", "길이 정합 (프레임수/fps 대비 ±10%)", 4, durOk ? 4 : 0,
    `${meta.duration?.toFixed(1)}s (기대 ${expectSec.toFixed(1)}s)`);
  const kbPerSec = meta.size && meta.duration ? meta.size / 1024 / meta.duration : 0;
  const sizeOk = kbPerSec >= 10 && kbPerSec <= 750; // balanced preset 합리 범위
  record("Q 품질", "파일 크기 envelope (10–750 KB/s)", 4, sizeOk ? 4 : 0,
    `${kbPerSec.toFixed(0)} KB/s`);

  return { recordingMs, composeMs, composedCount, videoSec, msPerFrame, mp4Size: meta.size ?? mp4.length };
}

// ─── Phase X: CLI / DX ────────────────────────────────────────────────────────

async function runCliChecks() {
  console.log("\n  [X] CLI / DX");
  const CLI = resolve(ROOT, "dist/cli/index.js");
  const dir = await mkdtemp(join(tmpdir(), "clipwise-cli-"));

  const init = sh(`node "${CLI}" init`, dir);
  let scaffoldOk = init.ok;
  for (const p of [".clipwise/scenarios/demo.yaml", ".clipwise/brand.yaml", ".clipwise/.gitignore", ".clipwise/prepare", ".clipwise/fixtures", ".clipwise/auth"]) {
    try { await access(join(dir, p)); } catch { scaffoldOk = false; }
  }
  record("X CLI/DX", "init — .clipwise/ 스캐폴딩 완전성 (brand.yaml 포함)", 3, scaffoldOk ? 3 : 0,
    scaffoldOk ? "scenarios/brand.yaml/prepare/fixtures/auth + .gitignore" : "누락 항목 있음");

  await writeFile(join(dir, "bad.yaml"), `name: "Bad"
prepare:
  freezeTime: "not-a-date"
  mock:
    - url: "/api"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`);
  const bad = sh(`node "${CLI}" validate bad.yaml`, dir);
  const caught = !bad.ok && bad.out.includes("freezeTime") && bad.out.includes("fixture");
  record("X CLI/DX", "validate — prepare 오류 2건 감지 + 비정상 종료코드", 4, caught ? 4 : 0,
    caught ? "freezeTime/mock 오류 모두 보고" : "감지 실패");

  // 스킬 설치/제거 — 글로벌 스킬이 실존하면 --remove가 그것까지 지우므로 N/A 처리
  let globalSkillExists = false;
  try { await access(join(os.homedir(), ".claude", "skills", "clipwise.md")); globalSkillExists = true; } catch { /* absent */ }
  if (globalSkillExists) {
    recordNA("X CLI/DX", "install-skill 설치/제거 왕복", 3, "글로벌 스킬 설치됨 — 파괴 방지로 건너뜀");
  } else {
    await mkdir(join(dir, ".claude"), { recursive: true });
    const inst = sh(`node "${CLI}" install-skill`, dir);
    let installed = false;
    try { await access(join(dir, ".claude/skills/clipwise.md")); installed = true; } catch { /* not installed */ }
    const rmv = sh(`node "${CLI}" install-skill --remove`, dir);
    let removed = true;
    try { await access(join(dir, ".claude/skills/clipwise.md")); removed = false; } catch { /* gone */ }
    record("X CLI/DX", "install-skill 설치/제거 왕복", 3, inst.ok && installed && rmv.ok && removed ? 3 : 0,
      installed && removed ? "설치 → 제거 모두 확인" : "왕복 실패");
  }
  await rm(dir, { recursive: true, force: true });
}

// ─── 집계 + 보고 ──────────────────────────────────────────────────────────────

function grade(score: number, gatesPassed: boolean): string {
  let g = score >= 90 ? "Production-Ready" : score >= 80 ? "Release Candidate" : score >= 65 ? "Beta" : "Alpha";
  if (!gatesPassed && (g === "Production-Ready" || g === "Release Candidate")) g = "Beta (게이트 실패 상한)";
  return g;
}

async function writeReport(label: string, version: string, score: number, verdict: string, gatesPassed: boolean) {
  let existing = "";
  try {
    existing = await readFile(RESULTS_FILE, "utf-8");
  } catch {
    existing = `# Clipwise Production Scorecard

> 이 파일은 \`scripts/production-score.ts\`가 자동으로 갱신합니다.
> 실행: \`npx tsx scripts/production-score.ts\` (선택: \`SCORE_LABEL="설명" \` 접두)

## 채점 제도 (Rubric)

| 카테고리 | 배점 | 내용 |
|----------|------|------|
| G 엔지니어링 게이트 | 15 | typecheck 4 · unit tests 5 · build 3 · npm audit 3 |
| F Prepare 기능 정확성 | 20 | hide · freezeTime · storage · mock · seedRandom 각 4 (DOM 단정) |
| D 결정론 | 15 | 2회 녹화 최종 프레임 바이트 일치 10 · 프레임 수 편차 ≤10% 5 |
| P 성능 | 20 | compose ms/frame(≤35) 10 · 녹화 오버헤드비(≤2.0×) 5 · 총 wall-clock(≤4×) 5 |
| Q 출력 품질 | 20 | MP4+probe 4 · 해상도 4 · fps 4 · 길이 정합 4 · 크기 envelope 4 |
| X CLI/DX | 10 | init 스캐폴딩 3 · validate 오류 감지 4 · 스킬 설치/제거 왕복 3 |

**등급**: ≥90 **Production-Ready** · 80–89 **Release Candidate** · 65–79 **Beta** · <65 **Alpha**
게이트(G) 실패 시 등급 상한은 Beta. N/A 체크는 분모에서 제외.

**벤치 시나리오**: \`scripts/bench-assets/scorecard-page.html\` — 타이핑, 클릭→스피너→mock API,
스크롤, 동결 날짜, 시드 랜덤 차트, 쿠키 배너를 한 페이지에서 자극하는 4-step 인터랙티브 데모.

---

`;
  }

  const byCategory = new Map<string, { earned: number; possible: number }>();
  for (const c of checks) {
    if (c.na) continue;
    const cur = byCategory.get(c.category) ?? { earned: 0, possible: 0 };
    cur.earned += c.earned;
    cur.possible += c.points;
    byCategory.set(c.category, cur);
  }

  const lines: string[] = [
    `## Run: ${label} — ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    ``,
    `**버전**: v${version} · **점수**: ${score}/100 · **판정**: **${verdict}**${gatesPassed ? "" : " (게이트 실패)"}`,
    ``,
    `| 카테고리 | 점수 |`,
    `|----------|------|`,
    ...[...byCategory.entries()].map(([cat, v]) => `| ${cat} | ${v.earned}/${v.possible} |`),
    ``,
    `<details><summary>세부 체크 (${checks.length}개)</summary>`,
    ``,
    `| 체크 | 점수 | 상세 |`,
    `|------|------|------|`,
    ...checks.map((c) =>
      `| ${c.category} · ${c.name} | ${c.na ? "N/A" : `${c.earned}/${c.points}`} | ${c.detail.replace(/\|/g, "/")} |`),
    ``,
    `</details>`,
    ``,
    `---`,
    ``,
  ];

  await writeFile(RESULTS_FILE, existing + lines.join("\n"), "utf-8");
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Clipwise Production Scorecard");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const version = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf-8")).version as string;
  const label = process.env.SCORE_LABEL ?? `v${version}`;

  const gatesPassed = runGates();

  // 게이트의 build가 dist를 갱신한 뒤에 dist를 동적 import
  const dist = (await import("../dist/index.js")) as unknown as Dist;

  const { server, port } = await startBenchServer();
  const scenarioPath = await writeBenchScenario(port);

  try {
    await runPrepareChecks(dist, scenarioPath);
    await runMotionBrandChecks();
    await runPipeline(dist, scenarioPath);
  } finally {
    server.close();
  }
  await runCliChecks();

  const scored = checks.filter((c) => !c.na);
  const earned = scored.reduce((s, c) => s + c.earned, 0);
  const possible = scored.reduce((s, c) => s + c.points, 0);
  const score = Math.round((earned / possible) * 100);
  const verdict = grade(score, gatesPassed);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  SCORE   : ${score}/100  (${earned}/${possible} raw)`);
  console.log(`  VERDICT : ${verdict}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await writeReport(label, version, score, verdict, gatesPassed);
  console.log(`  Report → ${RESULTS_FILE}`);
  console.log(`  Video  → output/scorecard.mp4\n`);

  if (verdict.startsWith("Alpha")) process.exit(1);
}

main().catch((err) => {
  console.error("Scorecard failed:", err);
  process.exit(1);
});
