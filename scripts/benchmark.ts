/**
 * Clipwise Pipeline Benchmark
 *
 * 녹화 → 합성 → 인코딩 각 단계의 시간을 측정하고
 * docs/benchmark-results.md 에 결과를 누적 기록한다.
 *
 * 사용법:
 *   npx tsx scripts/benchmark.ts [scenario.yaml]
 *   npx tsx scripts/benchmark.ts               # 기본: examples/demo.yaml
 */

import { performance } from "perf_hooks";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import os from "os";
// dist/ 빌드에서 임포트 — Worker 스레드(frame-worker.js)도 dist/를 참조하므로
// src/ 직접 임포트 시 ERR_MODULE_NOT_FOUND 발생
import {
  loadScenario,
  validateScenario,
  ClipwiseRecorder,
  CanvasRenderer,
  encodeMp4Stream,
  ConcurrentSession,
} from "../dist/index.js";

// BENCH_MODE=concurrent uses ConcurrentSession (overlaps recording + compose)
const CONCURRENT_MODE = process.env.BENCH_MODE === "concurrent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESULTS_FILE = resolve(ROOT, "docs/benchmark-results.md");

// ─── 시나리오 경로 결정 ───────────────────────────────────────────────────────
const scenarioArg = process.argv[2];
const scenarioPath = scenarioArg
  ? resolve(scenarioArg)
  : resolve(ROOT, "examples/demo.yaml");

const scenarioDir = dirname(scenarioPath);

// ─── 타이밍 헬퍼 ─────────────────────────────────────────────────────────────
function now(): number {
  return performance.now();
}

function ms(start: number, end: number): number {
  return Math.round(end - start);
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

// ─── 메모리 헬퍼 ─────────────────────────────────────────────────────────────
function memMB(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

// ─── 메인 벤치마크 ────────────────────────────────────────────────────────────
async function runBenchmark() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Clipwise Pipeline Benchmark");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 1. 시나리오 로드 ────────────────────────────────────────────────────────
  const scenario = await loadScenario(scenarioPath);

  // 상대 경로 파일 URL 변환
  for (const step of scenario.steps) {
    for (const action of step.actions) {
      if (action.action === "navigate") {
        const url = action.url;
        if (
          !url.startsWith("http://") &&
          !url.startsWith("https://") &&
          !url.startsWith("file://")
        ) {
          action.url = pathToFileURL(resolve(scenarioDir, url)).href;
        }
      }
    }
  }

  const validation = validateScenario(scenario);
  if (!validation.valid) {
    console.error("Scenario validation failed:", validation.errors);
    process.exit(1);
  }

  // ── 2. 시스템 정보 수집 ─────────────────────────────────────────────────────
  const cpus = os.cpus();
  const systemInfo = {
    platform: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    memTotalMB: Math.round(os.totalmem() / 1024 / 1024),
    nodeVersion: process.version,
  };

  console.log(`  Scenario : ${scenario.name}`);
  console.log(`  Steps    : ${scenario.steps.length}`);
  console.log(`  FPS      : ${scenario.output.fps}`);
  console.log(`  CPU      : ${systemInfo.cpu} (${systemInfo.cpuCores} cores)`);
  console.log(`  RAM      : ${systemInfo.memTotalMB} MB total`);
  console.log();

  await mkdir(resolve(ROOT, "output"), { recursive: true });

  let recordingMs = 0;
  let streamMs = 0;
  let totalMs = 0;
  let frameCount = 0;
  let composedCount = 0;
  let dedup: { received: number; stored: number; skipped: number } | undefined;
  let memAfterRecord = 0;
  let memBeforeRecord = 0;
  let memBeforeStream = 0;
  let memAfterStream = 0;
  let msPerFrame = 0;

  if (CONCURRENT_MODE) {
    // ── Phase 3-B: ConcurrentSession (recording + compose overlap) ─────────
    // wall-clock total ≈ max(recordingMs, composeMs) instead of sum
    const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);

    if (!renderer.canStreamOnline()) {
      console.error("  ERROR: scenario has speedRamp enabled — cannot use concurrent mode.");
      process.exit(1);
    }

    const recorder = new ClipwiseRecorder();
    const pipeline = new ConcurrentSession(recorder, scenario, renderer);

    console.log("  [1/1] Recording & composing concurrently (Phase 3-B)...");
    memBeforeRecord = memMB();
    const t0 = now();

    let lastComposed = 0;
    pipeline.on("progress", ({ composed }: { composed: number }) => { lastComposed = composed; });

    const { buffer: mp4Buffer, session } = await pipeline.run();

    const t1 = now();
    totalMs = ms(t0, t1);
    memAfterRecord = memMB();
    composedCount = lastComposed;
    frameCount = session.frames.length;
    dedup = session.dedupStats;
    const durationSec2 = frameCount / scenario.output.fps;
    msPerFrame = composedCount > 0 ? Math.round(totalMs / composedCount) : 0;
    memAfterStream = memAfterRecord;
    memBeforeStream = memBeforeRecord;

    if (dedup) {
      const skipPct = dedup.received > 0 ? Math.round((dedup.skipped / dedup.received) * 100) : 0;
      console.log(`    Dedup: ${dedup.received} received → ${dedup.stored} stored  (${dedup.skipped} skipped, ${skipPct}%)`);
    }
    console.log(`    ✓ ${formatMs(totalMs)}  →  ${composedCount} frames composed  (${msPerFrame}ms/frame concurrent)`);
    console.log(`    Memory: ${memBeforeRecord} MB → ${memAfterRecord} MB`);
    console.log();

    const outputPath = resolve(ROOT, "output/benchmark-output.mp4");
    await writeFile(outputPath, mp4Buffer);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  RESULTS  (BENCH_MODE=concurrent)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Record+Compose+Encode : ${formatMs(totalMs)} (wall-clock, overlapped)`);
    console.log(`  Frames (composed)     : ${composedCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const result: BenchmarkResult = {
      timestamp: new Date().toISOString(),
      label: process.env.BENCH_LABEL ?? "baseline",
      scenario: scenario.name,
      systemInfo,
      pipeline: { recordingMs: totalMs, streamMs: 0, totalMs },
      frames: { resampled: frameCount, composed: composedCount, fps: scenario.output.fps, durationSec: durationSec2 },
      perFrameMs: msPerFrame,
      memoryDeltaMB: { recording: memAfterRecord - memBeforeRecord, stream: 0 },
      dedup: dedup ?? null,
      concurrentMode: true,
    };

    await appendResultToMarkdown(result);
    console.log(`  Results saved → ${RESULTS_FILE}\n`);
    return result;
  }

  // ── 3. 녹화 단계 ────────────────────────────────────────────────────────────
  console.log("  [1/3] Recording...");
  const recorder = new ClipwiseRecorder();
  memBeforeRecord = memMB();
  const t0 = now();

  const session = await recorder.record(scenario);

  const t1 = now();
  recordingMs = ms(t0, t1);
  memAfterRecord = memMB();

  frameCount = session.frames.length;
  const durationSec = session.frames.length / scenario.output.fps;
  dedup = session.dedupStats;

  console.log(`    ✓ ${formatMs(recordingMs)}  →  ${frameCount} frames  (${durationSec.toFixed(1)}s @ ${scenario.output.fps}fps)`);
  if (dedup) {
    const skipPct = dedup.received > 0 ? Math.round((dedup.skipped / dedup.received) * 100) : 0;
    console.log(`    Dedup: ${dedup.received} received → ${dedup.stored} stored  (${dedup.skipped} skipped, ${skipPct}%)`);
  }
  console.log(`    Memory: ${memBeforeRecord} MB → ${memAfterRecord} MB  (+${memAfterRecord - memBeforeRecord} MB)`);
  console.log();

  // ── 4+5. 합성+인코딩 (스트리밍 파이프라인) ──────────────────────────────────
  // 합성 worker가 프레임을 만드는 즉시 FFmpeg stdin으로 공급.
  // 두 단계가 겹치므로 wall-clock 시간은 max(compose, encode) ≈ compose 시간.
  console.log("  [2/3] Composing & encoding (streaming pipeline)...");
  const renderer = new CanvasRenderer(
    scenario.effects,
    scenario.output,
    scenario.steps,
  );
  memBeforeStream = memMB();
  const t2 = now();

  const countingStream = (async function* () {
    for await (const frame of renderer.composeStream(session.frames)) {
      composedCount++;
      yield frame;
    }
  })();
  const mp4Buffer = await encodeMp4Stream(countingStream, scenario.output);

  const t3 = now();
  streamMs = ms(t2, t3);
  memAfterStream = memMB();
  msPerFrame = composedCount > 0 ? Math.round(streamMs / composedCount) : 0;

  const outputPath = resolve(ROOT, "output/benchmark-output.mp4");
  await writeFile(outputPath, mp4Buffer);

  console.log(`    ✓ ${formatMs(streamMs)}  →  ${composedCount} frames  (${msPerFrame}ms/frame, streaming)`);
  console.log(`    Memory: ${memBeforeStream} MB → ${memAfterStream} MB  (+${memAfterStream - memBeforeStream} MB)`);
  console.log();

  // ── 6. 결과 요약 ────────────────────────────────────────────────────────────
  totalMs = recordingMs + streamMs;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  RESULTS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Recording          : ${formatMs(recordingMs).padEnd(10)} (${pct(recordingMs, totalMs)}%)`);
  console.log(`  Compose+Encode     : ${formatMs(streamMs).padEnd(10)} (${pct(streamMs, totalMs)}%)`);
  console.log(`  ─────────────────────────`);
  console.log(`  Total              : ${formatMs(totalMs)}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 7. 결과 파일 기록 ───────────────────────────────────────────────────────
  const result: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    label: process.env.BENCH_LABEL ?? "baseline",
    scenario: scenario.name,
    systemInfo,
    pipeline: {
      recordingMs,
      streamMs,
      totalMs,
    },
    frames: {
      resampled: frameCount,
      composed: composedCount,
      fps: scenario.output.fps,
      durationSec,
    },
    perFrameMs: msPerFrame,
    memoryDeltaMB: {
      recording: memAfterRecord - memBeforeRecord,
      stream: memAfterStream - memBeforeStream,
    },
    dedup: session.dedupStats ?? null,
  };

  await appendResultToMarkdown(result);
  console.log(`  Results saved → ${RESULTS_FILE}\n`);

  return result;
}

function pct(part: number, total: number): string {
  return total === 0 ? "0" : Math.round((part / total) * 100).toString();
}

// ─── 결과 타입 ────────────────────────────────────────────────────────────────
interface BenchmarkResult {
  timestamp: string;
  label: string;
  scenario: string;
  systemInfo: {
    platform: string;
    cpu: string;
    cpuCores: number;
    memTotalMB: number;
    nodeVersion: string;
  };
  pipeline: {
    recordingMs: number;
    streamMs: number;
    totalMs: number;
  };
  frames: {
    resampled: number;
    composed: number;
    fps: number;
    durationSec: number;
  };
  perFrameMs: number;
  memoryDeltaMB: {
    recording: number;
    stream: number;
  };
  dedup: { received: number; stored: number; skipped: number } | null;
  concurrentMode?: boolean;
}

// ─── Markdown 누적 기록 ───────────────────────────────────────────────────────
async function appendResultToMarkdown(result: BenchmarkResult): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(RESULTS_FILE, "utf-8");
  } catch {
    // 파일 없으면 새로 생성
    existing = `# Clipwise Benchmark Results

> 이 파일은 \`scripts/benchmark.ts\`가 자동으로 갱신합니다.
> compaction 이후에도 내용이 유지됩니다.

`;
  }

  const { pipeline, frames, systemInfo, memoryDeltaMB } = result;

  const row = [
    `## Run: ${result.label} — ${result.timestamp.slice(0, 19).replace("T", " ")}`,
    ``,
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 시나리오 | ${result.scenario} |`,
    `| Label | \`${result.label}\` |`,
    `| CPU | ${systemInfo.cpu} (${systemInfo.cpuCores}코어) |`,
    `| Node | ${systemInfo.nodeVersion} |`,
    ``,
    `### 파이프라인 타이밍`,
    ``,
    `| 단계 | 시간 | 비중 |`,
    `|------|------|------|`,
    `| Recording | ${formatMsTable(pipeline.recordingMs)} | ${pct(pipeline.recordingMs, pipeline.totalMs)}% |`,
    `| Compose+Encode (streaming) | ${formatMsTable(pipeline.streamMs)} | ${pct(pipeline.streamMs, pipeline.totalMs)}% |`,
    `| **Total** | **${formatMsTable(pipeline.totalMs)}** | 100% |`,
    ``,
    `### 프레임 통계`,
    ``,
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 리샘플링 후 프레임 수 | ${frames.resampled} |`,
    `| 합성 완료 프레임 수 | ${frames.composed} |`,
    `| 영상 길이 | ${frames.durationSec.toFixed(1)}s @ ${frames.fps}fps |`,
    `| 프레임당 합성+인코딩 시간 | ${result.perFrameMs}ms/frame |`,
    ...(result.dedup
      ? [
          ``,
          `### 중복 제거 통계 (Dedup)`,
          ``,
          `| 항목 | 값 |`,
          `|------|-----|`,
          `| 수신 프레임 | ${result.dedup.received} |`,
          `| 저장 (고유) | ${result.dedup.stored} |`,
          `| 건너뜀 (중복) | ${result.dedup.skipped} (${result.dedup.received > 0 ? Math.round((result.dedup.skipped / result.dedup.received) * 100) : 0}%) |`,
        ]
      : []),
    ``,
    `### 메모리 사용 증분 (MB)`,
    ``,
    `| 단계 | 증가량 |`,
    `|------|--------|`,
    `| Recording | +${memoryDeltaMB.recording} MB |`,
    `| Compose+Encode | +${memoryDeltaMB.stream} MB |`,
    ``,
    `---`,
    ``,
  ].join("\n");

  await writeFile(RESULTS_FILE, existing + row, "utf-8");
}

function formatMsTable(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

// ─── 실행 ─────────────────────────────────────────────────────────────────────
runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
