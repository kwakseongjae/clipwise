import { chromium, type Page } from "playwright";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname, isAbsolute } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import sharp from "sharp";

import type {
  Scenario,
  Scene,
  ScreenScene,
  MotionScene,
  VignetteScene,
  StepAction,
  EffectsConfig,
  ComposedFrame,
} from "../script/types.js";
import { ClipwiseRecorder } from "../core/recorder.js";
import { applyPrepare } from "../core/prepare.js";
import { CanvasRenderer } from "../compose/canvas-renderer.js";
import { encodeMp4 } from "../compose/video-encoder.js";

/**
 * Scene System 런너 (v0.9 preview) — scenes 타임라인을 MP4로 렌더한다.
 *
 * 파이프라인:
 *   1. screen 신(테이크)을 커서 이펙트만 입힌 "클린 푸티지"로 녹화하고,
 *      step 경계 anchor와 셀렉터 bounding box를 실측한다
 *   2. 푸티지 프레임을 로컬 HTTP로 서빙한다
 *   3. motion/vignette 신을 deterministic seek 캡처한다 — vignette는 푸티지를
 *      <img> 레이어로 합성 (크롭·푸시인·분할·배속은 템플릿 CSS가 담당)
 *   4. 신별 인코딩 후 ffmpeg 하드컷 concat
 *
 * 제약(MVP): screen 신은 푸티지 소스 전용(타임라인 미등장), 출력은 mp4,
 * 셀렉터 좌표는 스크롤 0 기준 실측.
 */

interface BrandMotion {
  accent: string;
  font: string;
  annotations: boolean;
}

interface FootageTake {
  /** 프레임 PNG가 저장된 디스크 디렉토리 — 메모리에 들지 않아 긴 테이크도 안전. */
  framesDir: string;
  count: number;
  anchors: number[]; // step k 시작 시각(초)
  boxes: Map<string, { x: number; y: number; width: number; height: number }>;
}

export interface SceneProgress {
  scene: number;
  total: number;
  label: string;
}

/** .clipwise/brand.yaml에서 모션 브랜드 토큰을 로드 (없으면 기본값). */
async function loadBrandMotion(scenarioDir: string): Promise<BrandMotion> {
  const defaults: BrandMotion = { accent: "#6366f1", font: "editorial", annotations: true };
  for (const candidate of [
    resolve(scenarioDir, "..", "brand.yaml"), // .clipwise/scenarios/x.yaml → .clipwise/brand.yaml
    resolve(scenarioDir, "brand.yaml"),
    resolve(process.cwd(), ".clipwise", "brand.yaml"),
  ]) {
    try {
      const raw = parseYaml(await readFile(candidate, "utf-8"));
      return {
        accent: raw.accent ?? defaults.accent,
        font: raw.font ?? defaults.font,
        annotations: raw.annotations ?? defaults.annotations,
      };
    } catch {
      // 다음 후보
    }
  }
  return defaults;
}

/** 내장 템플릿 이름 또는 .html 경로를 file URL로 해석. */
function resolveMotionTemplate(template: string, scenarioDir: string): string {
  if (template.endsWith(".html")) {
    const p = isAbsolute(template) ? template : resolve(scenarioDir, template);
    if (!existsSync(p)) throw new Error(`Motion template not found: ${p}`);
    return pathToFileURL(p).href;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  for (const base of [
    resolve(here, "..", "templates", "motion"), // dist/ 기준 → 패키지 루트
    resolve(here, "..", "..", "templates", "motion"), // src/scenes/ 기준
  ]) {
    const p = join(base, `${template}.html`);
    if (existsSync(p)) return pathToFileURL(p).href;
  }
  throw new Error(
    `Unknown built-in motion template "${template}" (built-ins: intro-title, feature-callout, kinetic-type, vignette)`,
  );
}

/** screen 신의 푸티지용 이펙트 — 카메라는 vignette CSS가 담당하므로 전부 끈다. */
function footageEffects(effects: EffectsConfig): EffectsConfig {
  return {
    ...effects,
    zoom: { ...effects.zoom, enabled: false },
    deviceFrame: { ...effects.deviceFrame, enabled: false },
    keystroke: { ...effects.keystroke, enabled: false },
    speedRamp: { ...effects.speedRamp, enabled: false },
    smartSpeed: effects.smartSpeed ? { ...effects.smartSpeed, enabled: false } : effects.smartSpeed,
    background: {
      ...effects.background,
      type: "solid" as const,
      value: "#000000",
      padding: 0,
      borderRadius: 0,
      shadow: false,
    },
  };
}

/** probe용 경량 step 실행기 — 녹화 없이 종료 상태까지 도달시킨다. */
async function executeStepsForProbe(page: Page, scene: ScreenScene): Promise<void> {
  for (const step of scene.steps) {
    for (const action of step.actions as StepAction[]) {
      switch (action.action) {
        case "navigate":
          await page.goto(action.url, { waitUntil: action.waitUntil ?? "networkidle" });
          break;
        case "click":
          await page.click(action.selector, { timeout: action.timeout ?? 15000 });
          break;
        case "type":
          await page.fill(action.selector, action.text, { timeout: action.timeout ?? 15000 });
          break;
        case "hover":
          await page.hover(action.selector, { timeout: action.timeout ?? 15000 });
          break;
        case "scroll":
          await page.evaluate(
            ({ x, y }) => window.scrollBy(x, y),
            { x: action.x ?? 0, y: action.y ?? 0 },
          );
          break;
        case "wait":
          await page.waitForTimeout(Math.min(action.duration, 3000));
          break;
        case "waitForSelector":
          await page.waitForSelector(action.selector, {
            state: action.state ?? "visible",
            timeout: action.timeout ?? 15000,
          });
          break;
        case "waitForFunction":
          await page.waitForFunction(action.expression, undefined, { timeout: action.timeout ?? 30000 });
          break;
        default:
          // waitForNavigation/waitForURL/waitForResponse/smartWait/screenshot — probe에선 생략
          break;
      }
    }
  }
}

/** 세그먼트 인코딩 설정 — dpr 슈퍼샘플 해상도 + 준무손실(archive).
 *  최종 concat에서 1회만 손실 인코딩해 세대 손실을 막는다. */
function segmentOutput(scenario: Scenario, stageW: number, stageH: number) {
  const dpr = scenario.viewport.deviceScaleFactor ?? 1;
  return {
    ...scenario.output,
    width: stageW * dpr,
    height: stageH * dpr,
    preset: "archive" as const,
  };
}

/** 추가 출력 비율 → 무대(CSS) 크기. 푸티지는 공유, 무대만 재합성된다. */
const ASPECT_DIMS: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [960, 960],
};


/** screen 신을 녹화하고 클린 푸티지 + anchor + 셀렉터 좌표를 만든다. */
async function recordFootageTake(
  scenario: Scenario,
  scene: ScreenScene,
  selectors: string[],
): Promise<FootageTake> {
  // 1. 셀렉터 좌표 실측 — prepare를 적용한 채 steps를 재현하고 종료 상태에서 측정
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  if (selectors.length > 0) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: scenario.viewport.width, height: scenario.viewport.height },
    });
    if (scenario.prepare) await applyPrepare(context, scenario.prepare);
    const page = await context.newPage();
    await executeStepsForProbe(page, scene);
    await page.evaluate(() => window.scrollTo(0, 0)); // 좌표는 스크롤 0 기준
    for (const selector of selectors) {
      const box = await page.locator(selector).first().boundingBox();
      if (box) boxes.set(selector, box);
    }
    await browser.close();
  }

  // 2. 녹화 — smartSpeed/speedRamp가 꺼져 있으므로 composed 프레임은 1:1
  const takeScenario: Scenario = {
    ...scenario,
    steps: scene.steps,
    scenes: undefined,
    effects: footageEffects(scenario.effects),
  };
  const recorder = new ClipwiseRecorder();
  const session = await recorder.record(takeScenario);

  // dpr 슈퍼샘플 해상도로 합성 — 2×면 비네트 크롭 확대 시 진짜 디테일이 남는다
  const renderer = new CanvasRenderer(
    takeScenario.effects,
    segmentOutput(scenario, scenario.viewport.width, scenario.viewport.height),
    scene.steps,
  );

  // 합성 → PNG → 디스크 스트리밍 — 프레임 배열을 메모리에 들지 않아
  // 분 단위 긴 테이크에서도 메모리가 일정하다
  const framesDir = await mkdtemp(join(tmpdir(), `clipwise-footage-${scene.id}-`));
  let count = 0;
  for await (const f of renderer.composeStream(session.frames)) {
    const png = f.rawInfo
      ? await sharp(f.buffer, {
          raw: { width: f.rawInfo.width, height: f.rawInfo.height, channels: f.rawInfo.channels },
        })
          .png()
          .toBuffer()
      : f.buffer;
    await writeFile(join(framesDir, `${count}.png`), png);
    count++;
  }

  const anchors: number[] = [];
  for (let k = 0; k < scene.steps.length; k++) {
    const idx = session.frames.findIndex((f) => (f.stepIndex ?? 0) >= k);
    anchors.push(Math.max(0, idx) / scenario.output.fps);
  }
  return { framesDir, count, anchors, boxes };
}

/** 카드가 무대(레이블+캡션 포함)를 넘지 않도록 크롭 종횡비 기준 너비 산출. */
function fitCardW(cw: number, ch: number, maxW = 940, maxH = 540): number {
  return Math.round(Math.min(maxW, (maxH * cw) / ch));
}

/** motion/vignette 신을 deterministic seek 캡처해 MP4 세그먼트로 인코딩. */
async function captureMotionSegment(
  templateUrl: string,
  props: Record<string, string | number>,
  durationMs: number,
  scenario: Scenario,
  stageW: number,
  stageH: number,
): Promise<{ buffer: Buffer; seconds: number }> {
  const fps = scenario.output.fps;
  const totalFrames = Math.round((durationMs / 1000) * fps);
  const browser = await chromium.launch();
  // CSS 레이아웃은 무대(stage) 크기 그대로, 스크린샷은 dpr 배율의 물리 픽셀로 —
  // 타이포·선·푸티지가 레티나 해상도로 렌더된다
  const page = await browser.newPage({
    viewport: { width: stageW, height: stageH },
    deviceScaleFactor: scenario.viewport.deviceScaleFactor ?? 1,
  });

  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v)])),
  );
  await page.goto(`${templateUrl}?${params}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const frames: ComposedFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = (i / fps) * 1000;
    await page.evaluate(
      (time) => (window as unknown as { __clipwiseSeek: (t: number) => Promise<void> | void }).__clipwiseSeek(time),
      t,
    );
    frames.push({ index: i, buffer: await page.screenshot({ type: "png" }), timestamp: t });
  }
  await browser.close();
  return {
    buffer: await encodeMp4(frames, segmentOutput(scenario, stageW, stageH)),
    seconds: totalFrames / fps,
  };
}

/** vignette 신 → 템플릿 props 변환 (crop/fx 셀렉터는 실측 좌표로 치환). */
function vignetteProps(
  scene: VignetteScene,
  take: FootageTake,
  serverBase: string,
  scenario: Scenario,
  brand: BrandMotion,
  durMs: number,
  stageW: number,
  stageH: number,
): Record<string, string | number> {
  const W = scenario.viewport.width;
  const H = scenario.viewport.height;

  // 크롭 좌표 결정: selector 실측 → 명시 좌표 → 전체 화면
  let crop = { x: 0, y: 0, w: W, h: H };
  if (scene.crop) {
    const c = scene.crop;
    if (c.selector) {
      const box = take.boxes.get(c.selector);
      if (!box) throw new Error(`vignette crop selector "${c.selector}" not found in footage "${scene.footage}"`);
      crop = {
        x: Math.max(0, box.x - c.pad),
        y: Math.max(0, box.y - c.pad),
        w: box.width + c.pad * 2,
        h: box.height + c.pad * 2,
      };
    } else if (c.w !== undefined) {
      crop = { x: c.x ?? 0, y: c.y ?? 0, w: c.w, h: c.h ?? H };
    }
    if (c.maxH) crop.h = Math.min(crop.h, c.maxH);
  }

  const start =
    typeof scene.start === "number"
      ? scene.start
      : (take.anchors[scene.start.step] ?? 0) + scene.start.offset;

  const props: Record<string, string | number> = {
    accent: brand.accent,
    font: brand.font,
    dur: durMs / 1000,
    layout: scene.layout,
    num: scene.num ?? "",
    label: scene.label ?? "",
    caption: scene.caption ?? "",
    base: serverBase,
    count: take.count,
    fps: scenario.output.fps,
    start,
    rate: scene.rate,
    cropX: crop.x,
    cropY: crop.y,
    cropW: crop.w,
    cropH: crop.h,
    // 카드 크기 상한은 무대(stage) 크기 비례 — 어떤 출력 비율에서도 일관된 여백
    cardW: fitCardW(crop.w, crop.h, Math.round(stageW * 0.735), Math.round(stageH * 0.675)),
    pushFrom: scene.push?.from ?? 1,
    pushTo: scene.push?.to ?? 1,
  };
  if (scene.code?.length) props.code = scene.code.join("||");

  // 매치컷 — push 중심점을 셀렉터 실측 좌표로 (다음 신의 크롭을 향해 밀어 들어감)
  if (scene.push?.origin) {
    const box = take.boxes.get(scene.push.origin);
    if (!box) throw new Error(`vignette push.origin selector "${scene.push.origin}" not found in footage "${scene.footage}"`);
    props.pushOx = Math.max(0, Math.min(100, ((box.x + box.width / 2 - crop.x) / crop.w) * 100)).toFixed(1);
    props.pushOy = Math.max(0, Math.min(100, ((box.y + box.height / 2 - crop.y) / crop.h) * 100)).toFixed(1);
  }

  if (brand.annotations && scene.fx.length > 0) {
    props.fx = scene.fx
      .map((fx) => {
        let coords = fx.coords;
        if (fx.selector) {
          const box = take.boxes.get(fx.selector);
          if (!box) throw new Error(`vignette fx selector "${fx.selector}" not found in footage "${scene.footage}"`);
          coords =
            fx.kind === "arrow"
              ? [box.x - 160, box.y + 120, box.x - 12, box.y + box.height / 2]
              : [box.x, box.y, box.width, box.height]; // circle | spotlight
        }
        return `${fx.kind}@${coords!.join(",")}@${fx.delay}`;
      })
      .join(";");
  }
  return props;
}

export interface ScenesRenderResult {
  /** 기본 비율(viewport 크기) 렌더. */
  buffer: Buffer;
  /** output.aspects로 요청된 추가 비율 렌더 (label 예: "9x16"). */
  extras: { label: string; buffer: Buffer }[];
}

/**
 * scenes 타임라인을 렌더한다 — 기본 비율 + output.aspects 추가 비율.
 */
export async function renderScenesTimeline(
  scenario: Scenario,
  scenarioDir: string,
  onProgress?: (p: SceneProgress) => void,
): Promise<ScenesRenderResult> {
  const scenes = scenario.scenes ?? [];
  const screens = scenes.filter((s): s is ScreenScene => s.type === "screen");
  const timeline = scenes.filter((s): s is MotionScene | VignetteScene => s.type !== "screen");
  const brand = await loadBrandMotion(scenarioDir);

  // 각 footage가 필요로 하는 셀렉터(크롭 + fx) 수집
  const selectorsByFootage = new Map<string, Set<string>>();
  for (const scene of timeline) {
    if (scene.type !== "vignette") continue;
    const set = selectorsByFootage.get(scene.footage) ?? new Set<string>();
    if (scene.crop?.selector) set.add(scene.crop.selector);
    if (scene.push?.origin) set.add(scene.push.origin);
    for (const fx of scene.fx) if (fx.selector) set.add(fx.selector);
    selectorsByFootage.set(scene.footage, set);
  }

  // 1. screen 테이크 녹화
  const takes = new Map<string, FootageTake>();
  for (const screen of screens) {
    onProgress?.({ scene: 0, total: timeline.length, label: `footage "${screen.id}"` });
    takes.set(
      screen.id,
      await recordFootageTake(scenario, screen, [...(selectorsByFootage.get(screen.id) ?? [])]),
    );
  }

  // 2. 푸티지 프레임 서버
  const server: Server = createServer((req, res) => {
    const m = req.url?.match(/^\/([\w-]+)\/(\d+)\.png$/);
    const take = m ? takes.get(m[1]) : undefined;
    if (take) {
      const idx = Math.min(take.count - 1, parseInt(m![2], 10));
      readFile(join(take.framesDir, `${idx}.png`))
        .then((png) => {
          res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=3600" });
          res.end(png);
        })
        .catch(() => {
          res.writeHead(404);
          res.end();
        });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  // 3. 타임라인 합성 — 비율(aspect)별 패스. 푸티지(테이크)는 공유하고
  //    무대(타이포·카드 레이아웃·스레드)만 비율에 맞게 재합성한다.
  //
  // 비트 싱크 컷 — audio.bpm 지정 시 신 길이를 비트 격자(60000/bpm ms)에 스냅해
  // 모든 하드컷이 비트 위에 떨어진다 (모든 패스 동일)
  const beatMs = scenario.audio?.bpm ? 60000 / scenario.audio.bpm : 0;
  const durations = timeline.map((sc) =>
    beatMs ? Math.max(beatMs, Math.round(sc.duration / beatMs) * beatMs) : sc.duration,
  );
  const totalMs = durations.reduce((s, d) => s + d, 0);
  const totalSec = totalMs / 1000;

  // BGM 트랙 준비 — URL이면 사용자 머신에서 다운로드+캐시 (라이선스상 음원을
  // 패키지에 동봉할 수 없는 무료 트랙들 — Mixkit 등 — 을 한 줄로 쓰게 한다)
  let audioPath: string | null = null;
  if (scenario.audio) {
    const a = scenario.audio;
    if (/^https?:\/\//.test(a.file)) {
      const hash = createHash("sha256").update(a.file).digest("hex").slice(0, 16);
      audioPath = join(tmpdir(), `clipwise-audio-${hash}${a.file.match(/\.\w{2,4}$/)?.[0] ?? ".mp3"}`);
      if (!existsSync(audioPath)) {
        execSync(`curl -sL -o "${audioPath}" "${a.file}"`, { stdio: ["ignore", "ignore", "pipe"] });
      }
    } else {
      audioPath = isAbsolute(a.file) ? a.file : resolve(scenarioDir, a.file);
    }
  }

  const tmp = await mkdtemp(join(tmpdir(), "clipwise-scenes-"));

  /** 한 비율(무대 크기)에 대한 전체 타임라인 렌더. */
  const renderPass = async (stageW: number, stageH: number, passLabel: string): Promise<Buffer> => {
    // 스레드(연결 선): 영상 전체 길이 대비 각 신의 진행 구간을 선형 배분 —
    // 하드컷을 넘어도 같은 경로 위에서 끊김 없이 전진한다
    let elapsedMs = 0;
    const segments: { path: string; seconds: number }[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const scene = timeline[i];
      const dur = durations[i];
      const label = `${passLabel}${scene.type === "motion" ? scene.template : `vignette(${scene.footage})`}`;
      onProgress?.({ scene: i + 1, total: timeline.length, label });

      const thread: Record<string, string | number> = brand.annotations
        ? {
            threadFrom: (elapsedMs / totalMs).toFixed(4),
            threadTo: ((elapsedMs + dur) / totalMs).toFixed(4),
          }
        : {};
      // 전역 캡션 — 절대시각 트랙을 신 로컬 시간으로 변환할 오프셋과 함께 주입
      if (scenario.captions.length > 0) {
        thread.capsJson = JSON.stringify(scenario.captions);
        thread.capsOffset = (elapsedMs / 1000).toFixed(3);
      }
      elapsedMs += dur;

      let segment: { buffer: Buffer; seconds: number };
      if (scene.type === "motion") {
        const url = resolveMotionTemplate(scene.template, scenarioDir);
        segment = await captureMotionSegment(
          url,
          { accent: brand.accent, font: brand.font, dur: dur / 1000, ...scene.props, ...thread },
          dur,
          scenario,
          stageW,
          stageH,
        );
      } else {
        const take = takes.get(scene.footage)!;
        const url = resolveMotionTemplate("vignette", scenarioDir);
        segment = await captureMotionSegment(
          url,
          {
            ...vignetteProps(scene, take, `http://localhost:${port}/${scene.footage}`, scenario, brand, dur, stageW, stageH),
            ...thread,
          },
          dur,
          scenario,
          stageW,
          stageH,
        );
      }
      const segPath = join(tmp, `${passLabel.replace(/\W/g, "")}s${i}.mp4`);
      await writeFile(segPath, segment.buffer);
      segments.push({ path: segPath, seconds: segment.seconds });
    }

    // 하드컷 concat — 고정 무대 위에서 컷이 한 장면처럼 이어진다.
    // 캡션은 ASS로 이 단계에서 번인 (의존성 0, 결정론)
    const filters = segments.map((_, i) => `[${i}:v]format=yuv420p[v${i}]`).join(";");
    const concatInputs = segments.map((_, i) => `[v${i}]`).join("");
    const vChain = `${filters};${concatInputs}concat=n=${segments.length}:v=1:a=0[v]`;
    const finalLabel = "[v]";

    // 오디오 — 영상이 트랙보다 길면 루프, 짧으면 -t로 잘라 영상 길이가 항상 기준
    let audioInput = "";
    let audioMap = "";
    if (scenario.audio && audioPath) {
      const a = scenario.audio;
      const af: string[] = [];
      if (a.volume !== 1) af.push(`volume=${a.volume}`);
      if (a.fadeIn > 0) af.push(`afade=t=in:d=${a.fadeIn / 1000}`);
      if (a.fadeOut > 0) af.push(`afade=t=out:st=${Math.max(0, totalSec - a.fadeOut / 1000)}:d=${a.fadeOut / 1000}`);
      audioInput = `-stream_loop -1 -i "${audioPath}" `;
      audioMap = `-map ${segments.length}:a ${af.length ? `-af "${af.join(",")}" ` : ""}-c:a aac -b:a 192k `;
    }

    // 세그먼트가 준무손실(archive)이므로 손실 인코딩은 여기서 1회만 발생
    const outPath = join(tmp, `${passLabel.replace(/\W/g, "")}timeline.mp4`);
    execSync(
      `ffmpeg -y ${segments.map((s) => `-i "${s.path}"`).join(" ")} ${audioInput}` +
        `-filter_complex "${vChain}" ` +
        `-map "${finalLabel}" ${audioMap}-t ${totalSec.toFixed(3)} ` +
        `-c:v libx264 -crf 16 -preset slow -movflags +faststart "${outPath}"`,
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    return readFile(outPath);
  };

  try {
    const buffer = await renderPass(scenario.viewport.width, scenario.viewport.height, "");
    const extras: { label: string; buffer: Buffer }[] = [];
    for (const aspect of scenario.output.aspects) {
      const [w, h] = ASPECT_DIMS[aspect];
      extras.push({ label: aspect.replace(":", "x"), buffer: await renderPass(w, h, `${aspect} · `) });
    }
    return { buffer, extras };
  } finally {
    server.close();
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    for (const take of takes.values()) {
      await rm(take.framesDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
