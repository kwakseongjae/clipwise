/**
 * Clipwise v0.5.2 vs v0.6.0 Visual Comparison Benchmark
 *
 * Records the same scenario twice:
 *   A) "v0.5.2 defaults" — explicitly set old values (zoom 1.35x/600ms, cursor fast)
 *   B) "v0.6.0 defaults" — uses new defaults (zoom 1.25x/800ms, cursor normal)
 *
 * Outputs side-by-side comparison data: timing, file size, frame count.
 * Videos saved to output/ for manual visual inspection.
 *
 * Usage:
 *   npm run build && npx tsx scripts/compare-defaults.ts
 */

import { performance } from "perf_hooks";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFile, mkdir, stat } from "fs/promises";
import {
  ClipwiseRecorder,
  CanvasRenderer,
  encodeMp4Stream,
  parseScenario,
} from "../dist/index.js";
import yaml from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Use local demo page to avoid network timeout issues
const DEMO_URL = `file://${resolve(ROOT, "docs/demo/index.html")}`;

function now() { return performance.now(); }
function ms(s: number, e: number) { return Math.round(e - s); }
function fmt(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`; }

// ─── Scenario builders ───────────────────────────────────────────────────────

function buildSteps() {
  return [
    { name: "Load", captureDelay: 200, holdDuration: 1000,
      actions: [
        { action: "navigate", url: DEMO_URL, waitUntil: "load" },
        { action: "waitForSelector", selector: "#stat-users", state: "visible", timeout: 10000 },
      ] },
    { name: "Hover stat", captureDelay: 50, holdDuration: 600,
      actions: [{ action: "hover", selector: "#stat-users", timeout: 10000 }] },
    { name: "Click tab", captureDelay: 50, holdDuration: 700,
      actions: [{ action: "click", selector: "#tab-monthly", timeout: 10000 }] },
    { name: "Search", captureDelay: 50, holdDuration: 700,
      actions: [
        { action: "click", selector: "#search-input", timeout: 10000 },
        { action: "type", selector: "#search-input", text: "conversion", delay: 20, timeout: 10000 },
      ] },
    { name: "Scroll", captureDelay: 80, holdDuration: 500,
      actions: [{ action: "scroll", y: 350, smooth: true }] },
    { name: "Open modal", captureDelay: 80, holdDuration: 700,
      actions: [{ action: "click", selector: "#btn-new-project", timeout: 10000 }] },
    { name: "Type name", captureDelay: 50, holdDuration: 500,
      actions: [
        { action: "click", selector: "#project-name", timeout: 10000 },
        { action: "type", selector: "#project-name", text: "Clipwise Demo", delay: 22, timeout: 10000 },
      ] },
  ];
}

function buildScenario(label: string, effectsOverride: Record<string, unknown>) {
  const base = {
    name: label,
    viewport: { width: 1280, height: 800 },
    effects: {
      deviceFrame: { enabled: true, type: "browser", darkMode: true },
      background: {
        type: "gradient",
        value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        padding: 48, borderRadius: 14, shadow: true,
      },
      keystroke: { enabled: true, position: "bottom-center", fontSize: 16 },
      ...effectsOverride,
    },
    output: {
      format: "mp4", width: 1280, height: 800,
      fps: 30, preset: "social" as const,
      outputDir: resolve(ROOT, "output"),
      filename: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    },
    steps: buildSteps(),
  };

  return parseScenario(yaml.stringify(base));
}

// ─── Recording pipeline ──────────────────────────────────────────────────────

async function recordAndEncode(label: string, scenario: ReturnType<typeof buildScenario>) {
  console.log(`\n  ── ${label} ──`);

  const recorder = new ClipwiseRecorder();
  const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);

  // Record
  const t0 = now();
  const session = await recorder.record(scenario);
  const recordMs = ms(t0, now());
  console.log(`    Recording : ${fmt(recordMs)}  →  ${session.frames.length} frames`);
  if (session.dedupStats) {
    const d = session.dedupStats;
    console.log(`    Dedup     : ${d.received}→${d.stored} (skipped ${d.skipped})`);
  }

  // Compose + Encode
  let composed = 0;
  const t1 = now();
  const mp4Buffer = await encodeMp4Stream(
    (async function* () {
      for await (const frame of renderer.composeStream(session.frames)) {
        composed++;
        yield frame;
      }
    })(),
    scenario.output,
  );
  const composeMs = ms(t1, now());
  const totalMs = recordMs + composeMs;

  // Save
  const outPath = resolve(ROOT, "output", `${scenario.output.filename}.mp4`);
  await writeFile(outPath, mp4Buffer);
  const fileSizeMB = (mp4Buffer.length / (1024 * 1024)).toFixed(2);

  console.log(`    Compose   : ${fmt(composeMs)}  →  ${composed} frames (${Math.round(composeMs / Math.max(1, composed))}ms/frame)`);
  console.log(`    Total     : ${fmt(totalMs)}`);
  console.log(`    Output    : ${outPath} (${fileSizeMB} MB)`);

  return {
    label,
    recordMs,
    composeMs,
    totalMs,
    frameCount: session.frames.length,
    composedCount: composed,
    fileSizeMB: parseFloat(fileSizeMB),
    dedup: session.dedupStats ?? null,
    outputPath: outPath,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Clipwise Default Comparison Benchmark");
  console.log("  v0.5.2 defaults vs v0.6.0 defaults");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await mkdir(resolve(ROOT, "output"), { recursive: true });

  // A) v0.5.2 defaults: zoom moderate (1.35x, 600ms), cursor fast
  const resultA = await recordAndEncode(
    "v0.5.2-defaults",
    buildScenario("v0.5.2-defaults", {
      zoom: { enabled: true, scale: 1.35, intensity: "moderate", duration: 600,
        autoZoom: { followCursor: true } },
      cursor: { enabled: true, speed: "fast", clickEffect: true, highlight: true },
    }),
  );

  // B) v0.6.0 defaults: zoom light (1.25x, 800ms), cursor normal, followCursor panning
  const resultB = await recordAndEncode(
    "v0.6.0-defaults",
    buildScenario("v0.6.0-defaults", {
      zoom: { enabled: true, intensity: "light", duration: 800,
        autoZoom: { followCursor: true } },
      cursor: { enabled: true, speed: "normal", clickEffect: true, highlight: true },
    }),
  );

  // Comparison table
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  COMPARISON");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();

  const pad = (s: string, n: number) => s.padEnd(n);
  const header = `  ${pad("Metric", 28)} ${pad("v0.5.2", 16)} ${pad("v0.6.0", 16)} Delta`;
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));

  const row = (label: string, a: number | string, b: number | string, unit = "") => {
    const aStr = typeof a === "number" ? `${a}${unit}` : a;
    const bStr = typeof b === "number" ? `${b}${unit}` : b;
    let delta = "";
    if (typeof a === "number" && typeof b === "number") {
      const diff = b - a;
      const pct = a > 0 ? ((diff / a) * 100).toFixed(1) : "N/A";
      delta = `${diff >= 0 ? "+" : ""}${diff}${unit} (${pct}%)`;
    }
    console.log(`  ${pad(label, 28)} ${pad(aStr, 16)} ${pad(bStr, 16)} ${delta}`);
  };

  row("Recording time", fmt(resultA.recordMs), fmt(resultB.recordMs));
  row("Compose time", fmt(resultA.composeMs), fmt(resultB.composeMs));
  row("Total time", fmt(resultA.totalMs), fmt(resultB.totalMs));
  row("Frames (resampled)", resultA.frameCount, resultB.frameCount, "");
  row("Frames (composed)", resultA.composedCount, resultB.composedCount, "");
  row("File size", resultA.fileSizeMB, resultB.fileSizeMB, " MB");
  if (resultA.dedup && resultB.dedup) {
    row("Dedup skipped", resultA.dedup.skipped, resultB.dedup.skipped, "");
  }

  console.log();
  console.log("  Key visual differences (check manually):");
  console.log(`    v0.5.2: ${resultA.outputPath}`);
  console.log(`    v0.6.0: ${resultB.outputPath}`);
  console.log();
  console.log("  Expected visual changes:");
  console.log("    - Zoom: gentler pull-in (1.25x vs 1.35x), slower transition (800ms vs 600ms)");
  console.log("    - Cursor: smoother movement (normal vs fast)");
  console.log("    - Scroll: zoom suppressed during scroll action");
  console.log("    - Follow: focal point follows cursor position");
  console.log();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
