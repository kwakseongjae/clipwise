import { chromium, Browser, BrowserContext, Page, CDPSession } from "playwright";
import type {
  Scenario,
  CapturedFrame,
  DedupStats,
  StepAction,
  RecordingSession,
  RecordingHandle,
  KeystrokeEvent,
} from "../script/types.js";
import { interpolatePath } from "./cursor-tracker.js";
import { getElementCenter } from "./screenshot.js";

const CLICK_EFFECT_DURATION_MS = 500;
const REPAINT_INTERVAL_MS = 25;
const ACTION_GAP_MS = 30;

// Cursor speed presets.
// pixelsPerStep: target distance (px) each bezier step covers.
//   Lower = more steps = slower, smoother movement.
// stepDelayMs: time between each step.  Must be >= REPAINT_INTERVAL_MS so
//   the forced repaint is flushed and CDP can ACK + capture before the next step.
// minSteps / maxSteps: adaptive clamp so short distances don't overshoot and
//   very long distances don't take forever.
const CURSOR_SPEED_PRESETS = {
  fast:   { pixelsPerStep: 22, stepDelayMs: 22, minSteps: 8,  maxSteps: 35 },
  normal: { pixelsPerStep: 16, stepDelayMs: 26, minSteps: 10, maxSteps: 45 },
  slow:   { pixelsPerStep: 12, stepDelayMs: 32, minSteps: 12, maxSteps: 55 },
} as const;

interface RawFrame {
  buffer: Buffer;
  timestamp: number;
  /** Step index at capture time — set to this.currentStepIndex when the CDP frame arrives. */
  stepIndex: number;
  /** True when captured during a scroll action. */
  isScrolling: boolean;
  /** True when captured during a smartWait action. */
  isWaitingPhase: boolean;
  /** Display speed multiplier for smartWait frames. */
  displaySpeed?: number;
}

// ─── Async frame channel (Phase 3-B) ────────────────────────────────────────
// Single-producer / single-consumer async queue.
// push() buffers an item and wakes any awaiting consumer.
// close() signals end-of-stream; subsequent push() calls are no-ops.
class FrameChannel {
  private buffer: CapturedFrame[] = [];
  private resolve: ((v: void) => void) | null = null;
  private closed = false;

  push(frame: CapturedFrame): void {
    if (this.closed) return;
    this.buffer.push(frame);
    this.resolve?.();
    this.resolve = null;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.resolve?.();
    this.resolve = null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<CapturedFrame> {
    while (true) {
      while (this.buffer.length > 0) {
        yield this.buffer.shift()!;
      }
      if (this.closed) return;
      await new Promise<void>((r) => { this.resolve = r; });
    }
  }
}

// Byte length of the prefix slice used for deduplication comparison.
// PNG 파일의 IHDR(~33 bytes) + IDAT 시작 부분을 커버하는 충분한 크기.
// 화면 내용이 다르면 이 범위에서 반드시 차이가 생기며,
// 동일 내용이면 CDP PNG 인코더가 결정론적으로 동일 bytes를 생성한다.
const DEDUP_SIGNATURE_BYTES = 2048;

interface CursorKeyframe {
  position: { x: number; y: number };
  timestamp: number;
}

interface ClickEvent {
  position: { x: number; y: number };
  timestamp: number;
}

export class ClipwiseRecorder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpClient: CDPSession | null = null;

  private rawFrames: RawFrame[] = [];
  private cursorTimeline: CursorKeyframe[] = [];
  private clickTimeline: ClickEvent[] = [];
  private keystrokeTimeline: KeystrokeEvent[] = [];
  /** Incremented at the start of each `type` action so the HUD can render
   *  each input field's text on a separate line. */
  private keystrokeSessionId = 0;
  private currentStepIndex = 0;
  private isScrolling = false;
  private isWaitingPhase = false;
  private currentDisplaySpeed?: number;

  /** Tracks active infinite CSS animations (spinners/loaders). Count > 0 → loading state. */
  private activeLoaderAnimations = new Set<string>();
  /** Whether auto-loader detection is active (derived from smartSpeed.enabled). */
  private loaderDetectionEnabled = false;

  private cursorPosition: { x: number; y: number } = { x: 0, y: 0 };
  private viewport = { width: 1280, height: 800 };
  private deviceScaleFactor = 1;
  private isCapturing = false;
  private targetFps = 30;
  private cursorSpeed: keyof typeof CURSOR_SPEED_PRESETS = "normal";
  private firstContentTimestamp = 0;
  private pendingResponsePromises: Map<number, Promise<unknown>> = new Map();

  // ── 중복 프레임 제거 (Phase 1-A) ──────────────────────────────────────────
  // 직전 저장된 프레임의 앞부분 시그니처. 동일하면 화면 내용이 바뀌지 않은 것.
  private lastFrameSignature: Buffer | null = null;
  private dedupStats: DedupStats = { received: 0, stored: 0, skipped: 0 };

  // ── 스트리밍 채널 (Phase 3-B) ───────────────────────────────────────────
  // Set during recordToChannel(); null in normal record() mode.
  private frameChannel: FrameChannel | null = null;
  private channelIndex = 0; // sequential index for channel-pushed frames

  /**
   * Launch the browser and create a page with the scenario viewport.
   */
  async init(scenario: Scenario): Promise<void> {
    this.viewport = {
      width: scenario.viewport.width,
      height: scenario.viewport.height,
    };
    this.targetFps = scenario.output.fps;
    this.cursorSpeed = scenario.effects.cursor.speed;
    // Enable passive loader detection when smartSpeed is active
    this.loaderDetectionEnabled = scenario.effects.smartSpeed?.enabled ?? false;

    this.browser = await chromium.launch({ headless: true });

    // storageState가 있으면 Playwright에 직접 전달 (쿠키+localStorage 복원)
    const contextOptions: Record<string, unknown> = {
      viewport: this.viewport,
    };
    if (scenario.auth?.storageState) {
      contextOptions.storageState = scenario.auth.storageState;
    }
    this.context = await this.browser.newContext(contextOptions);

    // 인라인 쿠키가 있으면 추가 (storageState 이후에 적용)
    if (scenario.auth?.cookies?.length) {
      await this.context.addCookies(scenario.auth.cookies);
    }

    this.page = await this.context.newPage();

    // Reset state
    this.rawFrames = [];
    this.cursorTimeline = [];
    this.clickTimeline = [];
    this.keystrokeTimeline = [];
    this.keystrokeSessionId = 0;
    this.currentStepIndex = 0;
    this.isScrolling = false;
    this.isWaitingPhase = false;
    this.currentDisplaySpeed = undefined;
    this.activeLoaderAnimations.clear();
    this.cursorPosition = { x: 0, y: 0 };
    this.isCapturing = false;
    this.firstContentTimestamp = 0;
    this.lastFrameSignature = null;
    this.dedupStats = { received: 0, stored: 0, skipped: 0 };
    this.frameChannel = null;
    this.channelIndex = 0;
  }

  /**
   * Start CDP screencast for continuous frame capture.
   * Frames are received asynchronously and stored in rawFrames.
   */
  async startCapture(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    this.cdpClient = await this.page.context().newCDPSession(this.page);
    this.isCapturing = true;

    this.cdpClient.on(
      "Page.screencastFrame",
      async (event: { data: string; sessionId: number }) => {
        if (!this.isCapturing || !this.cdpClient) return;

        const buffer = Buffer.from(event.data, "base64");
        this.dedupStats.received++;

        // 직전 프레임과 앞부분 시그니처 비교.
        // CDP PNG 인코더는 동일 화면 내용에 대해 결정론적으로 동일 bytes를 생성하므로
        // prefix 비교만으로 중복 여부를 신뢰성 있게 판단할 수 있다.
        //
        // Skip dedup during waiting phases: spinners/loaders change pixels in the
        // center of the screen but the top-2048-byte signature stays identical,
        // causing all loader frames to be discarded.  smartSpeed handles compression
        // of these frames instead, so dedup can safely be bypassed.
        const signature = buffer.subarray(0, DEDUP_SIGNATURE_BYTES);
        const isInLoadingState = this.isWaitingPhase
          || (this.loaderDetectionEnabled && this.activeLoaderAnimations.size > 0);
        const isDuplicate = !isInLoadingState
          && this.lastFrameSignature !== null
          && this.lastFrameSignature.length === signature.length
          && this.lastFrameSignature.equals(signature);

        if (isDuplicate) {
          this.dedupStats.skipped++;
        } else {
          this.lastFrameSignature = Buffer.from(signature); // 복사 후 저장
          const captureTime = Date.now();
          // Auto-detect loading state: explicit smartWait OR active loader animations
          const isLoading = this.isWaitingPhase
            || (this.loaderDetectionEnabled && this.activeLoaderAnimations.size > 0);
          const rawFrame: RawFrame = { buffer, timestamp: captureTime, stepIndex: this.currentStepIndex, isScrolling: this.isScrolling, isWaitingPhase: isLoading, displaySpeed: this.currentDisplaySpeed };
          this.rawFrames.push(rawFrame);
          this.dedupStats.stored++;

          // Phase 3-B: push to channel for concurrent composition.
          // Only emit after first content is available (same trim as buildCapturedFrames).
          if (this.frameChannel && this.firstContentTimestamp > 0) {
            const frame = this.buildFrameOnline(
              rawFrame,
              this.channelIndex++,
            );
            this.frameChannel.push(frame);
          }
        }

        // ACK so CDP sends the next frame
        await this.cdpClient
          .send("Page.screencastFrameAck", {
            sessionId: event.sessionId,
          })
          .catch(() => {});
      },
    );

    // ── Auto loader detection via CDP Animation domain ─────────────────
    // Passively listens for CSS animations with infinite iterations and
    // rotation/pulse keyframes.  When such animations are active, frames
    // are automatically marked as loading state for smartSpeed processing.
    if (this.loaderDetectionEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.cdpClient.on("Animation.animationStarted", (event: any) => {
        const anim = event.animation;
        const iterations = anim?.source?.iterations ?? 0;
        const isInfinite = iterations === -1 || iterations > 100;
        const animName = anim?.name || "";
        const isLoaderPattern = /spin|rotate|pulse|bounce|loading|skeleton|shimmer/i.test(animName);
        if (anim?.type === "CSSAnimation" && isInfinite && isLoaderPattern) {
          this.activeLoaderAnimations.add(anim.id);
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.cdpClient.on("Animation.animationCanceled", (event: any) => {
        this.activeLoaderAnimations.delete(event.id);
      });
      await this.cdpClient.send("Animation.enable").catch(() => {});
    }

    // PNG format captures lossless frames — eliminates JPEG DCT block artifacts
    // that accumulate through the multi-layer effects pipeline. Memory usage
    // increases (~3-4x vs JPEG) but removes the primary source of quality loss.
    // maxWidth/maxHeight are in physical pixels (viewport × deviceScaleFactor),
    // giving 2x resolution for sharper zoom crops and better overall detail.
    await this.cdpClient.send("Page.startScreencast", {
      format: "png",
      maxWidth: this.viewport.width * this.deviceScaleFactor,
      maxHeight: this.viewport.height * this.deviceScaleFactor,
      everyNthFrame: 1,
    });

    // Record initial cursor position
    this.cursorTimeline.push({
      position: { ...this.cursorPosition },
      timestamp: Date.now(),
    });
  }

  /**
   * Stop CDP screencast and flush remaining frames.
   */
  async stopCapture(): Promise<void> {
    this.isCapturing = false;

    if (this.cdpClient) {
      await this.cdpClient.send("Page.stopScreencast").catch(() => {});
      await this.cdpClient.detach().catch(() => {});
      this.cdpClient = null;
    }

    // Small delay to flush any remaining frames
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  /**
   * Execute the full scenario with continuous capture and return a RecordingSession.
   */
  async record(scenario: Scenario): Promise<RecordingSession> {
    await this.init(scenario);

    const startTime = Date.now();

    try {
      // Run step 0's actions before starting capture so that browser
      // startup + page-load blank frames are not recorded into the video.
      if (scenario.steps.length > 0) {
        const s0 = scenario.steps[0];
        this.currentStepIndex = 0;
        this.preRegisterResponseListeners(s0.actions);
        for (let ai = 0; ai < s0.actions.length; ai++) {
          await this.executeAction(s0.actions[ai], ai);
        }
      }

      await this.startCapture();

      // Execute all steps (step 0's actions already ran above)
      for (let si = 0; si < scenario.steps.length; si++) {
        const step = scenario.steps[si];
        this.currentStepIndex = si;

        if (si > 0) {
          this.preRegisterResponseListeners(step.actions);
          for (let ai = 0; ai < step.actions.length; ai++) {
            await this.executeAction(step.actions[ai], ai);
          }
        }

        // captureDelay: wait with forced repaints for page to settle
        if (step.captureDelay > 0) {
          await this.waitWithRepaints(step.captureDelay);
        }

        // holdDuration: additional hold time with forced repaints
        const holdMs = step.holdDuration;
        if (holdMs > 0) {
          await this.waitWithRepaints(holdMs);
        }
      }

      await this.stopCapture();

      // Build raw CapturedFrame array, then resample to target FPS
      const rawFrames = this.buildCapturedFrames();
      const recordingDurationMs = Date.now() - startTime;
      const frames = this.resampleToTargetFps(
        rawFrames,
        recordingDurationMs,
      );

      return {
        scenario,
        frames,
        startTime,
        endTime: Date.now(),
        dedupStats: { ...this.dedupStats },
      };
    } catch (error) {
      await this.stopCapture().catch(() => {});

      const rawFrames = this.buildCapturedFrames();
      const recordingDurationMs = Date.now() - startTime;
      const frames = this.resampleToTargetFps(
        rawFrames,
        recordingDurationMs,
      );
      const err =
        error instanceof Error ? error : new Error(String(error));
      (err as Error & { partialSession?: RecordingSession }).partialSession =
        {
          scenario,
          frames,
          startTime,
          endTime: Date.now(),
          dedupStats: { ...this.dedupStats },
        };
      throw err;
    } finally {
      await this.cleanup();
    }
  }

  // ─── Streaming recording API (Phase 3-B) ──────────────────────────────────

  /**
   * Start recording concurrently and return a RecordingHandle immediately.
   *
   * frameStream: yields CapturedFrames as each unique frame arrives from CDP
   *   (post-dedup, sequential indices starting at 0, NO FPS resampling).
   *   Closes when recording ends.
   *
   * done: resolves with the full RecordingSession (FPS-resampled) once
   *   all steps have completed and the browser has been cleaned up.
   *
   * Use this with CanvasRenderer.composeStreamOnline() to overlap recording
   * time with composition time — total wall-clock ≈ max(recordingMs, composeMs).
   */
  recordToChannel(scenario: Scenario): RecordingHandle {
    const channel = new FrameChannel();

    const done = (async (): Promise<RecordingSession> => {
      try {
        await this.init(scenario);
        this.frameChannel = channel;

        const startTime = Date.now();

        // Run step 0's actions before starting capture so that browser
        // startup + page-load blank frames are not recorded into the video.
        if (scenario.steps.length > 0) {
          const s0 = scenario.steps[0];
          this.currentStepIndex = 0;
          this.preRegisterResponseListeners(s0.actions);
          for (let ai = 0; ai < s0.actions.length; ai++) {
            await this.executeAction(s0.actions[ai], ai);
          }
        }

        await this.startCapture();

        for (let si = 0; si < scenario.steps.length; si++) {
          const step = scenario.steps[si];
          this.currentStepIndex = si;
          if (si > 0) {
            this.preRegisterResponseListeners(step.actions);
            for (let ai = 0; ai < step.actions.length; ai++) {
              await this.executeAction(step.actions[ai], ai);
            }
          }
          if (step.captureDelay > 0) await this.waitWithRepaints(step.captureDelay);
          if (step.holdDuration > 0) await this.waitWithRepaints(step.holdDuration);
        }

        await this.stopCapture();
        channel.close();

        const rawFrames = this.buildCapturedFrames();
        const recordingDurationMs = Date.now() - startTime;
        const frames = this.resampleToTargetFps(rawFrames, recordingDurationMs);

        return {
          scenario,
          frames,
          startTime,
          endTime: Date.now(),
          dedupStats: { ...this.dedupStats },
        };
      } catch (error) {
        channel.close();
        await this.stopCapture().catch(() => {});

        const rawFrames = this.buildCapturedFrames();
        const session: RecordingSession = {
          scenario,
          frames: rawFrames,
          startTime: Date.now(),
          dedupStats: { ...this.dedupStats },
        };
        const err = error instanceof Error ? error : new Error(String(error));
        (err as Error & { partialSession?: RecordingSession }).partialSession = session;
        throw err;
      } finally {
        await this.cleanup();
      }
    })();

    return { frameStream: channel, done };
  }

  /**
   * Build a single CapturedFrame from a RawFrame in real-time.
   * Used by recordToChannel() to emit frames as they arrive.
   * Cursor/click data reflects the timeline up to this moment.
   */
  private buildFrameOnline(raw: RawFrame, sequentialIndex: number): CapturedFrame {
    const cursorPos = this.interpolateCursorAt(raw.timestamp);

    const clickEvent = this.clickTimeline.find(
      (click) =>
        raw.timestamp >= click.timestamp &&
        raw.timestamp <= click.timestamp + CLICK_EFFECT_DURATION_MS,
    );

    let clickProgress: number | undefined;
    if (clickEvent) {
      clickProgress = Math.min(1, (raw.timestamp - clickEvent.timestamp) / CLICK_EFFECT_DURATION_MS);
    }

    const frameKeystrokes = this.keystrokeTimeline.filter((k) => k.timestamp <= raw.timestamp);

    return {
      index: sequentialIndex,
      screenshot: raw.buffer,
      timestamp: raw.timestamp,
      cursorPosition: cursorPos,
      clickPosition: clickEvent?.position ?? null,
      clickProgress,
      viewport: { ...this.viewport },
      deviceScaleFactor: this.deviceScaleFactor,
      stepIndex: raw.stepIndex,
      keystrokes: frameKeystrokes.length > 0 ? frameKeystrokes : undefined,
      isScrolling: raw.isScrolling || undefined,
      isWaitingPhase: raw.isWaitingPhase || undefined,
      displaySpeed: raw.displaySpeed,
    };
  }

  /**
   * Force a unique DOM repaint visible in the top scanlines of the captured PNG.
   *
   * Uses a 1×1 px fixed-position element at z-index MAX, sitting above ALL
   * overlays including modals (position:fixed;z-index:100;backdrop-filter:blur).
   * Alternates background between #000001 and #000100 — two colors that are
   * visually indistinguishable (1/255 difference in R or G channel against a
   * dark page) but produce distinct PNG byte sequences, defeating dedup.
   *
   * This replaces the previous `document.documentElement.style.outline` approach
   * which failed whenever a full-viewport fixed overlay (e.g. modal backdrop)
   * was composited on top of the outline, making y=0 PNG bytes identical across
   * frames and causing dedup to collapse all modal-typing frames into one.
   */
  private async forceRepaint(t: boolean): Promise<void> {
    if (!this.page) return;
    await this.page
      .evaluate((toggle: boolean) => {
        let el = document.getElementById("__cw_rf__");
        if (!el) {
          el = document.createElement("div");
          el.id = "__cw_rf__";
          el.style.cssText =
            "position:fixed;top:0;left:0;width:1px;height:1px;" +
            "z-index:2147483647;pointer-events:none";
          (document.body ?? document.documentElement).appendChild(el);
        }
        el.style.background = toggle ? "#000001" : "#000100";
      }, t)
      .catch(() => {});
  }

  /**
   * Wait for a given duration while forcing periodic repaints
   * so CDP screencast keeps sending frames even on static pages.
   */
  private async waitWithRepaints(durationMs: number): Promise<void> {
    if (!this.page || durationMs <= 0) return;

    const endTime = Date.now() + durationMs;
    let toggle = false;

    while (Date.now() < endTime && this.isCapturing) {
      await this.forceRepaint(toggle);
      toggle = !toggle;

      const remaining = endTime - Date.now();
      if (remaining > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(REPAINT_INTERVAL_MS, remaining)),
        );
      }
    }
  }

  /**
   * Pre-register waitForResponse listeners at the start of each step.
   * This ensures the listener is active before any preceding action
   * (e.g. click) triggers the request, preventing race conditions
   * where the response arrives before the listener is set up.
   */
  private preRegisterResponseListeners(actions: StepAction[]): void {
    this.pendingResponsePromises.clear();
    if (!this.page) return;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action.action === "waitForResponse") {
        this.pendingResponsePromises.set(
          i,
          this.page.waitForResponse(
            (response) =>
              response.url().includes(action.url) &&
              (action.status === undefined || response.status() === action.status),
            { timeout: action.timeout },
          ),
        );
      }
    }
  }

  /**
   * Execute a single action. CDP screencast captures frames continuously
   * in the background while actions are performed.
   */
  private async executeAction(action: StepAction, actionIndex: number = 0): Promise<void> {
    if (!this.page) {
      throw new Error("Page not initialized. Call init() first.");
    }

    switch (action.action) {
      case "navigate": {
        await this.page.goto(action.url, { waitUntil: action.waitUntil });
        // Wait for actual paint — double rAF ensures content is rendered
        await this.page.evaluate(() =>
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        ).catch(() => {});
        // Mark when first content is available (trims pre-navigate white frames)
        if (this.firstContentTimestamp === 0) {
          this.firstContentTimestamp = Date.now();
        }
        await this.waitWithRepaints(300);
        break;
      }

      case "click": {
        const target = await getElementCenter(this.page, action.selector, action.timeout);

        // Smooth cursor movement to the click target
        await this.moveCursorSmooth(target);

        // Record click event
        this.clickTimeline.push({
          position: { ...target },
          timestamp: Date.now(),
        });

        // Perform the actual click
        await this.page.click(action.selector, {
          delay: action.delay,
        });
        break;
      }

      case "type": {
        const inputTarget = await getElementCenter(
          this.page,
          action.selector,
          action.timeout,
        );

        // Move cursor to the input field
        await this.moveCursorSmooth(inputTarget);

        // Click to focus
        this.clickTimeline.push({
          position: { ...inputTarget },
          timestamp: Date.now(),
        });
        await this.page.click(action.selector);

        // New input field → new session line in the keystroke HUD.
        // Incrementing here (after focus click, before first char) ensures
        // each `type` action appears on its own line regardless of timing.
        this.keystrokeSessionId++;
        const currentSessionId = this.keystrokeSessionId;

        // Type character by character with forced repaint per keystroke.
        //
        // Why the forced repaint is required:
        //   The dedup signature only covers the first ~2048 bytes of the PNG
        //   which corresponds to the top ~8px of a 1280×800 frame.  Input
        //   fields are typically at y > 100px, so changes to their text are
        //   NOT visible in the signature.  Without a forced repaint the dedup
        //   logic treats every keystroke frame as a duplicate of the previous
        //   one and discards it — making typing appear to happen in an instant.
        // Track the last click registration time so we can refresh it during
        // long typing sequences.  Without periodic refresh, the single initial
        // click expires after CLICK_EFFECT_DURATION_MS (500ms) and zoom releases
        // mid-typing.  Refreshing every 400ms keeps the click zone alive
        // throughout, and mergeClickZones() merges them into one continuous zone.
        let lastClickRefresh = Date.now();
        let typeRepaintToggle = false;
        for (const char of action.text) {
          await this.page.keyboard.type(char);
          typeRepaintToggle = !typeRepaintToggle;
          await this.forceRepaint(typeRepaintToggle);
          this.keystrokeTimeline.push({
            key: char,
            timestamp: Date.now(),
            sessionId: currentSessionId,
          });
          await new Promise((resolve) => setTimeout(resolve, action.delay));

          // Refresh click event before the previous one expires
          const now = Date.now();
          if (now - lastClickRefresh >= 400) {
            this.clickTimeline.push({
              position: { ...inputTarget },
              timestamp: now,
            });
            lastClickRefresh = now;
          }
        }

        // React/Vue/Angular controlled input 호환성:
        // Playwright의 keyboard.type()은 native DOM 이벤트만 발생시키므로
        // React의 synthetic event system이 onChange를 감지하지 못할 수 있음.
        // native value setter로 값을 재설정하고 input/change 이벤트를 dispatch.
        await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return;
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) {
            setter.call(el, (el as HTMLInputElement).value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, action.selector);

        // Final click at typing end to ensure the zoom zone extends
        // through the hold duration after the last character.
        this.clickTimeline.push({
          position: { ...inputTarget },
          timestamp: Date.now(),
        });
        break;
      }

      case "scroll": {
        const scrollTarget = action.selector
          ? await getElementCenter(this.page, action.selector, action.timeout)
          : null;

        const scrollDistance = Math.abs(action.y) + Math.abs(action.x);
        this.isScrolling = true;

        if (action.smooth && scrollDistance > 0) {
          // Drive scroll incrementally so CDP captures a frame for each step.
          // A single scrollBy({behavior:'smooth'}) hands control to the browser's
          // CSS scroll animation, which CDP can't reliably sample frame-by-frame.
          // ~25px per step at 30ms delay gives ~750px/s — visually comfortable.
          const scrollSteps = Math.max(12, Math.round(scrollDistance / 25));
          const yStep = action.y / scrollSteps;
          const xStep = action.x / scrollSteps;

          for (let s = 0; s < scrollSteps; s++) {
            await this.page.evaluate(
              ({ dy, dx, sel }: { dy: number; dx: number; sel: string | null }) => {
                const el = sel ? document.querySelector(sel) : window;
                if (!el) return;
                const opts = { left: dx, top: dy, behavior: "instant" as ScrollBehavior };
                if (el === window) window.scrollBy(opts);
                else (el as Element).scrollBy(opts);
              },
              { dy: yStep, dx: xStep, sel: action.selector ?? null },
            );
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          await this.waitWithRepaints(150);
        } else {
          await this.page.evaluate(
            ({ x, y, selector }: { x: number; y: number; selector: string | null }) => {
              const target = selector ? document.querySelector(selector) : window;
              if (target) {
                const options = { left: x, top: y, behavior: "instant" as ScrollBehavior };
                if (target === window) window.scrollBy(options);
                else (target as Element).scrollBy(options);
              }
            },
            { x: action.x, y: action.y, selector: action.selector ?? null },
          );
          await this.waitWithRepaints(100);
        }

        if (scrollTarget) {
          this.cursorPosition = scrollTarget;
          this.cursorTimeline.push({
            position: { ...scrollTarget },
            timestamp: Date.now(),
          });
        }

        this.isScrolling = false;
        await this.waitWithRepaints(120);
        break;
      }

      case "wait": {
        await this.waitWithRepaints(action.duration);
        break;
      }

      case "hover": {
        const hoverTarget = await getElementCenter(
          this.page,
          action.selector,
          action.timeout,
        );

        // Smooth cursor movement to hover target
        await this.moveCursorSmooth(hoverTarget);
        await this.page.hover(action.selector);
        break;
      }

      case "screenshot": {
        // CDP screencast captures continuously - just pause briefly
        await this.waitWithRepaints(100);
        break;
      }

      case "waitForSelector": {
        const locator = this.page.locator(action.selector).first();
        await locator.waitFor({ state: action.state, timeout: action.timeout });
        break;
      }

      case "waitForNavigation": {
        await this.page.waitForLoadState(action.waitUntil, { timeout: action.timeout });
        break;
      }

      case "waitForURL": {
        await this.page.waitForURL(action.url, { timeout: action.timeout });
        break;
      }

      case "waitForFunction": {
        await this.page.waitForFunction(action.expression, undefined, {
          polling: action.polling,
          timeout: action.timeout,
        });
        break;
      }

      case "waitForResponse": {
        const pending = this.pendingResponsePromises.get(actionIndex);
        if (pending) {
          await pending;
        }
        break;
      }

      case "smartWait": {
        // Mark frames captured during this wait as waiting phase
        this.isWaitingPhase = true;
        this.currentDisplaySpeed = action.displaySpeed;

        try {
          // Build the condition promise
          let conditionPromise: Promise<unknown>;
          switch (action.until) {
            case "networkIdle":
              conditionPromise = this.page.waitForLoadState("networkidle", { timeout: action.timeout });
              break;
            case "selector":
              conditionPromise = action.selector
                ? this.page.locator(action.selector).first().waitFor({ state: "visible", timeout: action.timeout })
                : Promise.resolve();
              break;
            case "domStable":
              conditionPromise = this.page.waitForFunction(
                () => new Promise<boolean>((resolve) => {
                  let timer: ReturnType<typeof setTimeout>;
                  const observer = new MutationObserver(() => {
                    clearTimeout(timer);
                    timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 500);
                  });
                  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
                  timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 500);
                }),
                undefined,
                { timeout: action.timeout },
              );
              break;
            default:
              conditionPromise = Promise.resolve();
          }

          // Run forced repaints IN PARALLEL with the condition wait.
          // Without this, the dedup signature (top 2048 bytes of PNG) doesn't
          // change when a spinner is in the center of the screen, causing ALL
          // spinner frames to be discarded as duplicates.  The repaint loop
          // toggles a 1px element at the top of the viewport, making each
          // frame unique so CDP captures them for the fast-forward effect.
          let waitDone = false;
          const repaintLoop = (async () => {
            let toggle = false;
            while (!waitDone && this.isCapturing && this.page) {
              await this.forceRepaint(toggle);
              toggle = !toggle;
              await new Promise((r) => setTimeout(r, REPAINT_INTERVAL_MS));
            }
          })();

          await conditionPromise;
          waitDone = true;
          await repaintLoop;
        } finally {
          this.isWaitingPhase = false;
          this.currentDisplaySpeed = undefined;
        }
        break;
      }
    }

    // Action gap: give CDP time to capture frames between consecutive actions
    await this.waitWithRepaints(ACTION_GAP_MS);
  }

  /**
   * Suppress all CSS transitions and animations on the page during cursor
   * movement.  Hover-state transitions (background, transform, box-shadow,
   * etc.) on elements the cursor passes over generate CSS-animation-driven
   * CDP frames that arrive asynchronously relative to our cursor step
   * intervals.  Those extra frames are timestamped when they're ACK-drained,
   * which can be many milliseconds after the actual cursor moved — causing
   * interpolateCursorAt() to map them to a newer cursor position while the
   * screenshot still shows older content → visible stutter.
   *
   * Suppressing transitions during movement eliminates these extra frames
   * entirely regardless of which elements the path crosses.  Transitions are
   * restored immediately after arrival, so hover effects on the final target
   * element still appear during the subsequent holdDuration.
   */
  private async suppressTransitions(): Promise<void> {
    if (!this.page) return;
    await this.page
      .evaluate(() => {
        if (document.getElementById("__cw_notrans__")) return;
        const s = document.createElement("style");
        s.id = "__cw_notrans__";
        s.textContent =
          "*{transition-duration:0s!important;transition-delay:0s!important}";
        (document.head ?? document.documentElement).appendChild(s);
      })
      .catch(() => {});
  }

  private async restoreTransitions(): Promise<void> {
    if (!this.page) return;
    await this.page
      .evaluate(() => {
        document.getElementById("__cw_notrans__")?.remove();
      })
      .catch(() => {});
  }

  /**
   * Move cursor smoothly from current position to target.
   *
   * Key design decisions:
   *  1. Adaptive step count — proportional to travel distance so short and
   *     long movements feel equally paced (pixelsPerStep controls speed).
   *  2. Forced repaint per step — moving the mouse in headless Chrome does NOT
   *     visually change the screenshot (the cursor is rendered in post-processing).
   *     Without a forced repaint, dedup collapses every intermediate frame into
   *     the first one, making the cursor appear to teleport.
   *  3. Transition suppression — CSS transitions on hovered elements generate
   *     asynchronous CDP frames that desync cursor position from screenshot
   *     content.  All transitions are suppressed for the duration of movement
   *     and restored on arrival (see suppressTransitions / restoreTransitions).
   *  4. Capped bezier curve — perpendicular offset is capped at 30 px regardless
   *     of distance, preventing a visible arc on long-distance movements.
   */
  private async moveCursorSmooth(
    target: { x: number; y: number },
  ): Promise<void> {
    if (!this.page) return;

    const preset = CURSOR_SPEED_PRESETS[this.cursorSpeed];
    const from = { ...this.cursorPosition };
    const distance = Math.hypot(target.x - from.x, target.y - from.y);

    // Skip sub-pixel movements
    if (distance < 2) {
      this.cursorPosition = { ...target };
      return;
    }

    // Adaptive step count — clamp between preset min/max
    const steps = Math.round(
      Math.min(Math.max(distance / preset.pixelsPerStep, preset.minSteps), preset.maxSteps),
    );

    const path = interpolatePath(from, target, steps);
    let repaintToggle = false;

    // Suppress CSS transitions for the entire movement so hover-state
    // animations on intermediate elements don't generate extra CDP frames.
    await this.suppressTransitions();
    try {
      for (const point of path) {
        await this.page.mouse.move(point.x, point.y);

        // Force a unique DOM paint so CDP doesn't dedup this frame away.
        repaintToggle = !repaintToggle;
        await this.forceRepaint(repaintToggle);

        this.cursorTimeline.push({
          position: { x: point.x, y: point.y },
          timestamp: Date.now(),
        });

        await new Promise((resolve) => setTimeout(resolve, preset.stepDelayMs));
      }
    } finally {
      // Always restore transitions, even if movement throws.
      await this.restoreTransitions();
    }

    this.cursorPosition = { ...target };
    await this.waitWithRepaints(80);
  }

  /**
   * Build CapturedFrame array from raw screencast frames,
   * interpolating cursor positions and mapping click events.
   */
  private buildCapturedFrames(): CapturedFrame[] {
    if (this.rawFrames.length === 0) return [];

    // Trim frames captured before first page content was rendered (white screen)
    const contentStart = this.firstContentTimestamp;
    const trimmed = contentStart > 0
      ? this.rawFrames.filter((f) => f.timestamp >= contentStart)
      : this.rawFrames;
    if (trimmed.length === 0) return [];

    return trimmed.map((raw, index) => {
      const cursorPos = this.interpolateCursorAt(raw.timestamp);

      const clickEvent = this.clickTimeline.find(
        (click) =>
          raw.timestamp >= click.timestamp &&
          raw.timestamp <= click.timestamp + CLICK_EFFECT_DURATION_MS,
      );

      let clickProgress: number | undefined;
      if (clickEvent) {
        const elapsed = raw.timestamp - clickEvent.timestamp;
        clickProgress = Math.min(1, elapsed / CLICK_EFFECT_DURATION_MS);
      }

      // Collect keystrokes active at this frame's timestamp
      const frameKeystrokes = this.keystrokeTimeline.filter(
        (k) => k.timestamp <= raw.timestamp,
      );

      return {
        index,
        screenshot: raw.buffer,
        timestamp: raw.timestamp,
        cursorPosition: cursorPos,
        clickPosition: clickEvent?.position ?? null,
        clickProgress,
        viewport: { ...this.viewport },
        deviceScaleFactor: this.deviceScaleFactor,
        keystrokes: frameKeystrokes.length > 0 ? frameKeystrokes : undefined,
        stepIndex: raw.stepIndex, // use per-frame step index captured at event time
        isScrolling: raw.isScrolling || undefined,
        isWaitingPhase: raw.isWaitingPhase || undefined,
        displaySpeed: raw.displaySpeed,
      };
    });
  }

  /**
   * Resample captured frames to the target FPS.
   *
   * Even if CDP only sent a few unique screenshots, we generate enough
   * output frames for smooth playback. Each output frame:
   * - Uses the nearest raw screenshot (may be duplicated)
   * - Gets a uniquely interpolated cursor position
   * - Gets properly mapped click effects
   */
  private resampleToTargetFps(
    frames: CapturedFrame[],
    recordingDurationMs: number,
  ): CapturedFrame[] {
    if (frames.length === 0) return [];

    const targetFrameCount = Math.max(
      frames.length,
      Math.round((recordingDurationMs / 1000) * this.targetFps),
    );

    // If we already have enough frames, return as-is
    if (targetFrameCount <= frames.length) return frames;

    const startTime = frames[0].timestamp;
    const endTime = frames[frames.length - 1].timestamp;
    const duration = Math.max(1, endTime - startTime);

    const resampled: CapturedFrame[] = [];

    for (let i = 0; i < targetFrameCount; i++) {
      const t = targetFrameCount > 1 ? i / (targetFrameCount - 1) : 0;
      const targetTimestamp = startTime + t * duration;

      // Find the nearest raw frame by timestamp using binary search (O(log N))
      const lo = this.binarySearchTimeline(frames, targetTimestamp);
      const hi = Math.min(lo + 1, frames.length - 1);
      const nearestIdx =
        Math.abs(frames[hi].timestamp - targetTimestamp) <
        Math.abs(frames[lo].timestamp - targetTimestamp)
          ? hi
          : lo;

      // Re-interpolate cursor position at this exact timestamp
      const cursorPos = this.interpolateCursorAt(targetTimestamp);

      // Check for click events at this timestamp
      const clickEvent = this.clickTimeline.find(
        (click) =>
          targetTimestamp >= click.timestamp &&
          targetTimestamp <= click.timestamp + CLICK_EFFECT_DURATION_MS,
      );

      let clickProgress: number | undefined;
      if (clickEvent) {
        const elapsed = targetTimestamp - clickEvent.timestamp;
        clickProgress = Math.min(1, elapsed / CLICK_EFFECT_DURATION_MS);
      }

      // Collect keystrokes active at this timestamp
      const frameKeystrokes = this.keystrokeTimeline.filter(
        (k) => k.timestamp <= targetTimestamp,
      );

      resampled.push({
        index: i,
        screenshot: frames[nearestIdx].screenshot,
        timestamp: targetTimestamp,
        cursorPosition: cursorPos,
        clickPosition: clickEvent?.position ?? null,
        clickProgress,
        viewport: { ...this.viewport },
        deviceScaleFactor: this.deviceScaleFactor,
        stepName: frames[nearestIdx].stepName,
        stepIndex: frames[nearestIdx].stepIndex,
        keystrokes: frameKeystrokes.length > 0 ? frameKeystrokes : undefined,
      });
    }

    return resampled;
  }

  /**
   * Interpolate cursor position at a given timestamp using the cursor timeline.
   */
  private interpolateCursorAt(
    timestamp: number,
  ): { x: number; y: number } {
    if (this.cursorTimeline.length === 0) return { x: 0, y: 0 };
    if (this.cursorTimeline.length === 1) {
      return { ...this.cursorTimeline[0].position };
    }

    // Find the two keyframes surrounding this timestamp using binary search (O(log N))
    const idx = this.binarySearchTimeline(this.cursorTimeline, timestamp);
    const before = this.cursorTimeline[idx];
    const after = this.cursorTimeline[Math.min(idx + 1, this.cursorTimeline.length - 1)];

    // Clamp if timestamp is outside keyframe range
    if (timestamp <= before.timestamp) return { ...before.position };
    if (timestamp >= after.timestamp) return { ...after.position };

    // Linear interpolation between keyframes
    const t =
      (timestamp - before.timestamp) / (after.timestamp - before.timestamp);

    return {
      x: Math.round(
        before.position.x + (after.position.x - before.position.x) * t,
      ),
      y: Math.round(
        before.position.y + (after.position.y - before.position.y) * t,
      ),
    };
  }

  /**
   * Binary search: returns the index of the last entry whose timestamp <= target.
   * Assumes the array is sorted by timestamp in ascending order.
   */
  private binarySearchTimeline(
    timeline: { timestamp: number }[],
    target: number,
  ): number {
    let lo = 0;
    let hi = timeline.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timeline[mid].timestamp <= target) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /**
   * Clean up browser resources. Always called after recording.
   */
  async cleanup(): Promise<void> {
    if (this.cdpClient) {
      await this.cdpClient.detach().catch(() => {});
      this.cdpClient = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
  }
}
