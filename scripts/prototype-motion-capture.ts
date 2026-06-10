/**
 * Motion Scene deterministic seek 캡처 프로토타입 (Scene System v0.9 사전 검증)
 *
 * 검증 목표:
 *   1. `__clipwiseSeek(t)` 로 CSS 애니메이션을 프레임별로 정확히 캡처할 수 있는가
 *   2. 캡처가 결정론적인가 — 동일 시나리오 2회 캡처 시 프레임 바이트가 100% 일치하는가
 *   3. 캡처된 프레임이 기존 인코딩 파이프라인(encodeMp4)에 그대로 합류하는가
 *
 * 실행: npx tsx scripts/prototype-motion-capture.ts
 *   (dist 빌드 불필요 — 인코더는 워커를 쓰지 않으므로 src 직접 import)
 */

import { chromium, type Page } from "playwright";
import { createHash } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL } from "url";

import { encodeMp4 } from "../src/compose/video-encoder.js";
import { OutputConfigSchema, type ComposedFrame } from "../src/script/types.js";

const FPS = 30;
const DURATION_MS = 2800;
const WIDTH = 1280;
const HEIGHT = 800;
const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);

const TEMPLATE = resolve("templates/motion/intro-title.html");
const OUT_DIR = resolve("output");

interface CaptureResult {
  frames: Buffer[];
  hashes: string[];
  elapsedMs: number;
}

async function capturePass(page: Page): Promise<CaptureResult> {
  const start = Date.now();
  const frames: Buffer[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = (i / FPS) * 1000;
    await page.evaluate((time) => (window as any).__clipwiseSeek(time), t);
    const png = await page.screenshot({ type: "png" });
    frames.push(png);
    hashes.push(createHash("sha256").update(png).digest("hex"));
  }

  return { frames, hashes, elapsedMs: Date.now() - start };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  const url =
    pathToFileURL(TEMPLATE).href +
    "?title=Smart%20Speed&subtitle=%EB%A1%9C%EB%94%A9%EC%9D%80%20%EB%B9%A0%EB%A5%B4%EA%B2%8C%2C%20%EC%BD%98%ED%85%90%EC%B8%A0%EB%8A%94%20%EB%98%90%EB%A0%B7%ED%95%98%EA%B2%8C&accent=%236366f1";
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  // ── 검증 1+2: 동일 캡처 2회 → 바이트 단위 비교 ──
  console.log(`Capturing ${TOTAL_FRAMES} frames @ ${FPS}fps (pass 1)...`);
  const pass1 = await capturePass(page);
  console.log(`  pass 1: ${pass1.elapsedMs}ms (${(pass1.elapsedMs / TOTAL_FRAMES).toFixed(1)}ms/frame)`);

  console.log(`Capturing ${TOTAL_FRAMES} frames @ ${FPS}fps (pass 2)...`);
  const pass2 = await capturePass(page);
  console.log(`  pass 2: ${pass2.elapsedMs}ms (${(pass2.elapsedMs / TOTAL_FRAMES).toFixed(1)}ms/frame)`);

  await browser.close();

  const mismatches = pass1.hashes.filter((h, i) => h !== pass2.hashes[i]).length;
  const uniqueFrames = new Set(pass1.hashes).size;
  console.log(`\nDeterminism: ${TOTAL_FRAMES - mismatches}/${TOTAL_FRAMES} frames identical across passes`);
  console.log(`Animation coverage: ${uniqueFrames}/${TOTAL_FRAMES} unique frames (낮으면 애니메이션이 멈춰있다는 뜻)`);

  if (mismatches > 0) {
    console.error(`FAIL: ${mismatches} frames differ between passes — capture is non-deterministic`);
    process.exit(1);
  }

  // ── 검증 3: 기존 인코딩 파이프라인 합류 ──
  const composed: ComposedFrame[] = pass1.frames.map((buffer, index) => ({
    index,
    buffer,
    timestamp: (index / FPS) * 1000,
  }));

  const output = OutputConfigSchema.parse({
    format: "mp4",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    preset: "balanced",
  });

  console.log("\nEncoding MP4 via existing pipeline (encodeMp4)...");
  const mp4 = await encodeMp4(composed, output);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, "motion-prototype.mp4");
  await writeFile(outPath, mp4);
  console.log(`\nOK: ${outPath} (${(mp4.length / 1024).toFixed(0)} KB, ${DURATION_MS / 1000}s @ ${FPS}fps)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
