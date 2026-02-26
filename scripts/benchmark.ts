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
  encodeMp4,
} from "../dist/index.js";

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

  // ── 3. 녹화 단계 ────────────────────────────────────────────────────────────
  console.log("  [1/3] Recording...");
  const recorder = new ClipwiseRecorder();
  const memBeforeRecord = memMB();
  const t0 = now();

  const session = await recorder.record(scenario);

  const t1 = now();
  const recordingMs = ms(t0, t1);
  const memAfterRecord = memMB();

  const frameCount = session.frames.length;
  const durationSec = session.frames.length / scenario.output.fps;
  const dedup = session.dedupStats;

  console.log(`    ✓ ${formatMs(recordingMs)}  →  ${frameCount} frames  (${durationSec.toFixed(1)}s @ ${scenario.output.fps}fps)`);
  if (dedup) {
    const skipPct = dedup.received > 0 ? Math.round((dedup.skipped / dedup.received) * 100) : 0;
    console.log(`    Dedup: ${dedup.received} received → ${dedup.stored} stored  (${dedup.skipped} skipped, ${skipPct}%)`);
  }
  console.log(`    Memory: ${memBeforeRecord} MB → ${memAfterRecord} MB  (+${memAfterRecord - memBeforeRecord} MB)`);
  console.log();

  // ── 4. 합성 단계 ────────────────────────────────────────────────────────────
  console.log("  [2/3] Composing effects...");
  const renderer = new CanvasRenderer(
    scenario.effects,
    scenario.output,
    scenario.steps,
  );
  const memBeforeCompose = memMB();
  const t2 = now();

  const composed = await renderer.composeAll(session.frames);

  const t3 = now();
  const compositionMs = ms(t2, t3);
  const memAfterCompose = memMB();
  const msPerFrame = Math.round(compositionMs / composed.length);

  console.log(`    ✓ ${formatMs(compositionMs)}  →  ${composed.length} frames  (${msPerFrame}ms/frame)`);
  console.log(`    Memory: ${memBeforeCompose} MB → ${memAfterCompose} MB  (+${memAfterCompose - memBeforeCompose} MB)`);
  console.log();

  // ── 5. 인코딩 단계 ──────────────────────────────────────────────────────────
  console.log("  [3/3] Encoding...");
  await mkdir(resolve(ROOT, "output"), { recursive: true });
  const outputPath = resolve(ROOT, "output/benchmark-output.mp4");
  const memBeforeEncode = memMB();
  const t4 = now();

  await encodeMp4(composed, scenario.output, outputPath);

  const t5 = now();
  const encodingMs = ms(t4, t5);
  const memAfterEncode = memMB();

  console.log(`    ✓ ${formatMs(encodingMs)}  →  ${outputPath.split("/").pop()}`);
  console.log(`    Memory: ${memBeforeEncode} MB → ${memAfterEncode} MB`);
  console.log();

  // ── 6. 결과 요약 ────────────────────────────────────────────────────────────
  const totalMs = recordingMs + compositionMs + encodingMs;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  RESULTS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Recording   : ${formatMs(recordingMs).padEnd(10)} (${pct(recordingMs, totalMs)}%)`);
  console.log(`  Composition : ${formatMs(compositionMs).padEnd(10)} (${pct(compositionMs, totalMs)}%)`);
  console.log(`  Encoding    : ${formatMs(encodingMs).padEnd(10)} (${pct(encodingMs, totalMs)}%)`);
  console.log(`  ─────────────────────────`);
  console.log(`  Total       : ${formatMs(totalMs)}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 7. 결과 파일 기록 ───────────────────────────────────────────────────────
  const result: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    label: process.env.BENCH_LABEL ?? "baseline",
    scenario: scenario.name,
    systemInfo,
    pipeline: {
      recordingMs,
      compositionMs,
      encodingMs,
      totalMs,
    },
    frames: {
      resampled: frameCount,
      composed: composed.length,
      fps: scenario.output.fps,
      durationSec,
    },
    perFrameMs: msPerFrame,
    memoryDeltaMB: {
      recording: memAfterRecord - memBeforeRecord,
      composition: memAfterCompose - memBeforeCompose,
      encoding: memAfterEncode - memBeforeEncode,
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
    compositionMs: number;
    encodingMs: number;
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
    composition: number;
    encoding: number;
  };
  dedup: { received: number; stored: number; skipped: number } | null;
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
    `| Composition | ${formatMsTable(pipeline.compositionMs)} | ${pct(pipeline.compositionMs, pipeline.totalMs)}% |`,
    `| Encoding | ${formatMsTable(pipeline.encodingMs)} | ${pct(pipeline.encodingMs, pipeline.totalMs)}% |`,
    `| **Total** | **${formatMsTable(pipeline.totalMs)}** | 100% |`,
    ``,
    `### 프레임 통계`,
    ``,
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 리샘플링 후 프레임 수 | ${frames.resampled} |`,
    `| 합성 완료 프레임 수 | ${frames.composed} |`,
    `| 영상 길이 | ${frames.durationSec.toFixed(1)}s @ ${frames.fps}fps |`,
    `| 프레임당 합성 시간 | ${result.perFrameMs}ms/frame |`,
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
    `| Composition | +${memoryDeltaMB.composition} MB |`,
    `| Encoding | +${memoryDeltaMB.encoding} MB |`,
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
