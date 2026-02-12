import { chromium, Browser, BrowserContext, Page, CDPSession } from "playwright";
import type {
  Scenario,
  CapturedFrame,
  StepAction,
  RecordingSession,
  KeystrokeEvent,
} from "../script/types.js";
import { interpolatePath } from "./cursor-tracker.js";
import { getElementCenter } from "./screenshot.js";

const CLICK_EFFECT_DURATION_MS = 500;
const REPAINT_INTERVAL_MS = 50;
const ACTION_GAP_MS = 30;

const CURSOR_SPEED_PRESETS = {
  fast:   { steps: 12, delay: 6 },   // ~72ms total
  normal: { steps: 18, delay: 8 },   // ~144ms total
  slow:   { steps: 24, delay: 12 },  // ~288ms total
} as const;

interface RawFrame {
  buffer: Buffer;
  timestamp: number;
}

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
  private currentStepIndex = 0;

  private cursorPosition: { x: number; y: number } = { x: 0, y: 0 };
  private viewport = { width: 1280, height: 800 };
  private isCapturing = false;
  private targetFps = 30;
  private cursorSpeed: keyof typeof CURSOR_SPEED_PRESETS = "fast";
  private firstContentTimestamp = 0;

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

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: this.viewport,
    });
    this.page = await this.context.newPage();

    // Reset state
    this.rawFrames = [];
    this.cursorTimeline = [];
    this.clickTimeline = [];
    this.keystrokeTimeline = [];
    this.currentStepIndex = 0;
    this.cursorPosition = { x: 0, y: 0 };
    this.isCapturing = false;
    this.firstContentTimestamp = 0;
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
        this.rawFrames.push({
          buffer,
          timestamp: Date.now(),
        });

        // ACK so CDP sends the next frame
        await this.cdpClient
          .send("Page.screencastFrameAck", {
            sessionId: event.sessionId,
          })
          .catch(() => {});
      },
    );

    await this.cdpClient.send("Page.startScreencast", {
      format: "jpeg",
      quality: 95,
      maxWidth: this.viewport.width,
      maxHeight: this.viewport.height,
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
      await this.startCapture();

      // Execute all steps
      for (let si = 0; si < scenario.steps.length; si++) {
        const step = scenario.steps[si];
        this.currentStepIndex = si;
        for (const action of step.actions) {
          await this.executeAction(action);
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
        };
      throw err;
    } finally {
      await this.cleanup();
    }
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
      await this.page
        .evaluate((t: boolean) => {
          // Minimal invisible change that triggers a repaint
          document.documentElement.style.outline = t
            ? "0.001px solid transparent"
            : "none";
        }, toggle)
        .catch(() => {});
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
   * Execute a single action. CDP screencast captures frames continuously
   * in the background while actions are performed.
   */
  private async executeAction(action: StepAction): Promise<void> {
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
        const target = await getElementCenter(this.page, action.selector);

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
        );

        // Move cursor to the input field
        await this.moveCursorSmooth(inputTarget);

        // Click to focus
        this.clickTimeline.push({
          position: { ...inputTarget },
          timestamp: Date.now(),
        });
        await this.page.click(action.selector);

        // Type character by character for visual effect
        for (const char of action.text) {
          await this.page.keyboard.type(char, { delay: action.delay });
          this.keystrokeTimeline.push({
            key: char,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case "scroll": {
        const scrollTarget = action.selector
          ? await getElementCenter(this.page, action.selector)
          : null;

        await this.page.evaluate(
          ({ x, y, smooth, selector }) => {
            const target = selector
              ? document.querySelector(selector)
              : window;
            if (target) {
              const options: ScrollToOptions = {
                left: x,
                top: y,
                behavior: smooth ? "smooth" : "instant",
              };
              if (target === window) {
                window.scrollBy(options);
              } else {
                (target as Element).scrollBy(options);
              }
            }
          },
          {
            x: action.x,
            y: action.y,
            smooth: action.smooth,
            selector: action.selector ?? null,
          },
        );

        if (scrollTarget) {
          this.cursorPosition = scrollTarget;
          this.cursorTimeline.push({
            position: { ...scrollTarget },
            timestamp: Date.now(),
          });
        }

        // Wait for scroll animation — scale with distance for long scrolls
        const scrollDistance = Math.abs(action.y) + Math.abs(action.x);
        const scrollWait = action.smooth
          ? Math.max(600, Math.round(scrollDistance * 0.8))
          : 100;
        await this.waitWithRepaints(scrollWait);
        // Brief settle time to ensure final scroll position is captured
        await this.waitWithRepaints(150);
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
    }

    // Action gap: give CDP time to capture frames between consecutive actions
    await this.waitWithRepaints(ACTION_GAP_MS);
  }

  /**
   * Move cursor smoothly from current position to target using
   * manual step-by-step movement with delays between each step.
   * Speed is controlled by the cursor.speed preset (fast/normal/slow).
   */
  private async moveCursorSmooth(
    target: { x: number; y: number },
  ): Promise<void> {
    if (!this.page) return;

    const { steps, delay } = CURSOR_SPEED_PRESETS[this.cursorSpeed];
    const from = { ...this.cursorPosition };

    // Calculate bezier path from current position to target
    const path = interpolatePath(from, target, steps);

    // Step through each point with a delay so CDP can capture frames
    for (const point of path) {
      await this.page.mouse.move(point.x, point.y);
      this.cursorTimeline.push({
        position: { x: point.x, y: point.y },
        timestamp: Date.now(),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.cursorPosition = { ...target };

    // Settle time after movement completes
    await this.waitWithRepaints(100);
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
        keystrokes: frameKeystrokes.length > 0 ? frameKeystrokes : undefined,
        stepIndex: this.currentStepIndex,
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

      // Find the nearest raw frame by timestamp
      let nearestIdx = 0;
      let minDist = Infinity;
      for (let j = 0; j < frames.length; j++) {
        const dist = Math.abs(frames[j].timestamp - targetTimestamp);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = j;
        }
      }

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

    // Find the two keyframes surrounding this timestamp
    let before = this.cursorTimeline[0];
    let after = this.cursorTimeline[this.cursorTimeline.length - 1];

    for (let i = 0; i < this.cursorTimeline.length - 1; i++) {
      if (
        this.cursorTimeline[i].timestamp <= timestamp &&
        this.cursorTimeline[i + 1].timestamp >= timestamp
      ) {
        before = this.cursorTimeline[i];
        after = this.cursorTimeline[i + 1];
        break;
      }
    }

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
