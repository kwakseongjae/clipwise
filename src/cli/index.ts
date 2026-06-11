#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { loadScenario } from "../script/parser.js";
import { validateScenario } from "../script/validator.js";
import { ClipwiseRecorder } from "../core/recorder.js";
import { CanvasRenderer } from "../compose/canvas-renderer.js";
import { encodeGif, encodeMp4Stream, savePngSequence } from "../compose/video-encoder.js";
import { StreamingSession, ConcurrentSession } from "../compose/streaming-session.js";
import type { PipelineProgress } from "../compose/streaming-session.js";
import { writeFile, mkdir, access, copyFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { homedir } from "os";

const program = new Command();

program
  .name("clipwise")
  .description(
    "Playwright-based cinematic screen recorder for product demos",
  )
  .version("0.10.0");

program
  .command("record")
  .description("Record a demo from a YAML scenario file")
  .argument("<scenario>", "Path to YAML scenario file")
  .option("-o, --output <dir>", "Output directory (default: scenario outputDir or .clipwise/output)")
  .option(
    "-f, --format <format>",
    "Output format (gif|mp4|png-sequence)",
  )
  .option("--no-effects", "Disable all effects")
  .action(async (scenarioPath: string, options) => {
    const spinner = ora();

    try {
      // 1. Load scenario
      spinner.start("Loading scenario...");
      const scenario = await loadScenario(scenarioPath);

      // Resolve relative file paths in navigate actions to file:// URLs
      const scenarioDir = dirname(resolve(scenarioPath));
      for (const step of scenario.steps) {
        for (const action of step.actions) {
          if (action.action === "navigate") {
            const url = action.url;
            if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file://")) {
              action.url = pathToFileURL(resolve(scenarioDir, url)).href;
            }
          }
        }
      }

      // Override output settings from CLI options.
      // -o가 없으면 시나리오의 outputDir(기본 .clipwise/output)을 존중한다.
      if (options.output) {
        scenario.output.outputDir = options.output;
      }
      const outDir = scenario.output.outputDir;
      if (options.format) {
        scenario.output.format = options.format;
      }

      spinner.succeed(`Scenario loaded: ${chalk.bold(scenario.name)}`);

      // 2. Validate
      spinner.start("Validating scenario...");
      const validation = validateScenario(scenario);

      if (!validation.valid) {
        spinner.fail("Scenario validation failed:");
        for (const error of validation.errors) {
          console.error(chalk.red(`  ✗ ${error}`));
        }
        process.exit(1);
      }

      for (const warning of validation.warnings) {
        console.warn(chalk.yellow(`  ⚠ ${warning}`));
      }
      spinner.succeed("Scenario is valid");

      // 3. Check browser availability
      spinner.start("Checking browser...");
      try {
        const { chromium } = await import("playwright");
        const testBrowser = await chromium.launch({ headless: true });
        await testBrowser.close();
        spinner.succeed("Browser ready");
      } catch {
        spinner.fail("Chromium not found");
        console.log(chalk.yellow("\nInstalling Chromium (one-time setup)...\n"));
        const { execSync } = await import("child_process");
        try {
          execSync("npx playwright install chromium", { stdio: "inherit" });
          console.log(chalk.green("\nChromium installed successfully!\n"));
        } catch {
          console.error(chalk.red("\nFailed to install Chromium. Run manually:\n  npx playwright install chromium\n"));
          process.exit(1);
        }
      }

      // Scene System (v0.9 preview): scenes 타임라인이 있으면 전용 런너로 렌더
      if (scenario.scenes?.length) {
        const { renderScenesTimeline } = await import("../scenes/runner.js");
        const outDir2 = scenario.output.outputDir;
        await mkdir(outDir2, { recursive: true });
        spinner.start(`Rendering ${scenario.scenes.length}-scene timeline...`);
        const buf = await renderScenesTimeline(scenario, scenarioDir, ({ scene, total, label }) => {
          spinner.text = scene === 0
            ? `Recording footage — ${label}...`
            : `Rendering scene ${scene}/${total} — ${label}...`;
        });
        const outputPath = join(outDir2, `${scenario.output.filename}.mp4`);
        await writeFile(outputPath, buf);
        spinner.succeed(`Timeline saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB)`);
        console.log(chalk.green("\nDone! 🎬"));
        return;
      }

      // 4+5+6. Record & encode
      // Phase 3-B adaptive strategy: when effects don't need the full frame array
      // (canStreamOnline) and format is MP4, use ConcurrentSession to overlap
      // recording with composition — total time ≈ max(recording, compose) not sum.
      await mkdir(outDir, { recursive: true });
      const recorder = new ClipwiseRecorder();
      const renderer = new CanvasRenderer(
        scenario.effects,
        scenario.output,
        scenario.steps,
      );

      const isConcurrentEligible =
        scenario.output.format === "mp4" &&
        options.effects !== false &&
        renderer.canStreamOnline();

      if (isConcurrentEligible) {
        // ── Concurrent path (Phase 3-B) ───────────────────────────────────
        // Recording and composition run in parallel.
        const pipeline = new ConcurrentSession(recorder, scenario, renderer);
        pipeline.on("progress", ({ composed, total, pct }: PipelineProgress) => {
          spinner.text = total > 0
            ? `Recording & composing... ${composed}/${total} (${pct}%)`
            : `Recording & composing... ${composed} frames`;
        });
        spinner.start(`Recording & composing ${scenario.steps.length} steps concurrently...`);
        const { buffer: mp4Buffer, session } = await pipeline.run();
        const outputPath = join(outDir, `${scenario.output.filename}.mp4`);
        await writeFile(outputPath, mp4Buffer);
        const sizeMB = (mp4Buffer.length / (1024 * 1024)).toFixed(2);
        spinner.succeed(
          `MP4 saved to ${chalk.bold(outputPath)} (${sizeMB} MB, ${session.frames.length} frames)`,
        );
      } else {
        // ── Sequential path (Phase 3-A / batch) ───────────────────────────
        spinner.start(`Recording ${scenario.steps.length} steps...`);
        const session = await recorder.record(scenario);
        spinner.succeed(`Recorded ${session.frames.length} frames`);

        if (scenario.output.format === "png-sequence") {
          let composedFrames;
          if (options.effects !== false) {
            spinner.start(`Applying effects to ${session.frames.length} frames...`);
            composedFrames = await renderer.composeAll(session.frames);
            spinner.succeed("Effects applied");
          } else {
            composedFrames = session.frames.map((f) => ({
              index: f.index, buffer: f.screenshot, timestamp: f.timestamp,
            }));
            spinner.info("Effects disabled, using raw frames");
          }
          spinner.start("Saving PNG sequence...");
          const paths = await savePngSequence(composedFrames, scenario.output);
          spinner.succeed(`Saved ${paths.length} frames to ${chalk.bold(outDir)}`);
        } else if (scenario.output.format === "mp4") {
          const outputPath = join(outDir, `${scenario.output.filename}.mp4`);
          let mp4Buffer: Buffer;
          if (options.effects === false) {
            spinner.start(`Encoding ${session.frames.length} raw frames...`);
            const rawStream = (async function* () {
              for (const f of session.frames) {
                yield { index: f.index, buffer: f.screenshot, timestamp: f.timestamp };
              }
            })();
            mp4Buffer = await encodeMp4Stream(rawStream, scenario.output);
          } else {
            const pipeline = new StreamingSession(session, renderer);
            pipeline.on("progress", ({ composed, total, pct }: PipelineProgress) => {
              spinner.text = `Composing & encoding... ${composed}/${total} (${pct}%)`;
            });
            spinner.start(`Composing & encoding ${session.frames.length} frames...`);
            mp4Buffer = await pipeline.run();
          }
          await writeFile(outputPath, mp4Buffer);
          const sizeMB = (mp4Buffer.length / (1024 * 1024)).toFixed(2);
          const audioMsg = scenario.audio ? ` + audio: ${scenario.audio.file}` : "";
          spinner.succeed(`MP4 saved to ${chalk.bold(outputPath)} (${sizeMB} MB${audioMsg})`);
        } else {
          // GIF: compose all first (palette quantization needs all frames)
          let composedFrames;
          if (options.effects !== false) {
            spinner.start(`Applying effects to ${session.frames.length} frames...`);
            composedFrames = await renderer.composeAll(session.frames);
            spinner.succeed("Effects applied");
          } else {
            composedFrames = session.frames.map((f) => ({
              index: f.index, buffer: f.screenshot, timestamp: f.timestamp,
            }));
            spinner.info("Effects disabled, using raw frames");
          }
          spinner.start("Encoding GIF...");
          const gifBuffer = await encodeGif(composedFrames, scenario.output);
          const outputPath = join(outDir, `${scenario.output.filename}.gif`);
          await writeFile(outputPath, gifBuffer);
          const sizeMB = (gifBuffer.length / (1024 * 1024)).toFixed(2);
          spinner.succeed(`GIF saved to ${chalk.bold(outputPath)} (${sizeMB} MB)`);
        }
      } // end sequential path

      console.log(chalk.green("\nDone! 🎬"));
    } catch (error) {
      spinner.fail("Recording failed");
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate a YAML scenario file")
  .argument("<scenario>", "Path to YAML scenario file")
  .action(async (scenarioPath: string) => {
    const spinner = ora();

    try {
      spinner.start("Loading scenario...");
      const scenario = await loadScenario(scenarioPath);
      spinner.succeed(`Loaded: ${chalk.bold(scenario.name)}`);

      const result = validateScenario(scenario);

      if (result.errors.length > 0) {
        console.log(chalk.red("\nErrors:"));
        for (const error of result.errors) {
          console.log(chalk.red(`  ✗ ${error}`));
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow("\nWarnings:"));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`  ⚠ ${warning}`));
        }
      }

      if (result.valid) {
        console.log(
          chalk.green("\nScenario is valid and ready to record."),
        );
      } else {
        console.log(
          chalk.red("\nScenario has errors. Fix them before recording."),
        );
        process.exit(1);
      }
    } catch (error) {
      spinner.fail("Validation failed");
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Scaffold a .clipwise/ directory (zero-footprint: delete it to remove every trace)")
  .action(async () => {
    const baseDir = resolve(".clipwise");

    try {
      await access(baseDir);
      console.log(chalk.yellow("Warning: .clipwise/ already exists in this directory."));
      console.log(chalk.yellow("Remove it first if you want a fresh scaffold.\n"));
      process.exit(1);
    } catch {
      // Directory doesn't exist, proceed
    }

    const template = `name: "My Demo"
viewport:
  width: 1280
  height: 800

effects:
  deviceFrame:
    enabled: true
    type: browser
  cursor:
    enabled: true
    clickEffect: true
    highlight: true
  background:
    type: gradient
    value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    padding: 48
    borderRadius: 14
    shadow: true

# Recording-time injection — tweak the page without touching your code.
# All assets referenced here resolve relative to this file.
# prepare:
#   hide:
#     - "#cookie-banner"
#   freezeTime: "2026-06-10T09:00:00Z"
#   seedRandom: 42
#   storage:
#     localStorage:
#       onboarding_done: "true"
#   mock:
#     - url: "/api/stats"
#       fixture: ../fixtures/stats.json
#   inject:
#     css: ../prepare/demo.css

output:
  format: mp4
  fps: 30
  preset: balanced  # social | balanced | archive

steps:
  - name: "Open app"
    captureDelay: 100
    holdDuration: 1000
    actions:
      - action: navigate
        url: "http://localhost:3000"
        waitUntil: load

  - name: "Click button"
    captureDelay: 50
    holdDuration: 800
    actions:
      - action: click
        selector: "#my-button"
`;

    // Keynote 스타터 — 호스팅 데모 대시보드 대상이라 수정 없이 바로 실행된다.
    // 사용자는 url과 셀렉터만 자기 앱으로 교체하면 된다.
    const keynoteTemplate = `# Keynote-style launch video — runs AS-IS against the hosted demo.
# Try it first:  clipwise record .clipwise/scenarios/keynote.yaml
# Then replace the url + selectors with your own app.

name: "My Launch Video"
viewport: { width: 1280, height: 800, deviceScaleFactor: 2 }   # 2 = retina quality

effects:
  cursor: { enabled: true, clickEffect: true, highlight: false, trail: false }

output:
  format: mp4
  fps: 30
  preset: balanced
  filename: keynote

scenes:
  # footage take — recorded once; vignettes below quote it by step
  - type: screen
    id: demo
    steps:
      - name: "Open"
        captureDelay: 120
        holdDuration: 1400
        actions:
          - action: navigate
            url: "https://kwakseongjae.github.io/clipwise/demo/"   # ← your app URL
            waitUntil: networkidle
      - name: "Stats"
        captureDelay: 50
        holdDuration: 700
        actions:
          - { action: hover, selector: "#stat-users" }             # ← your selectors
      - name: "Search"
        captureDelay: 50
        holdDuration: 500
        actions:
          - { action: type, selector: "#search-input", text: "growth report", delay: 28 }
      - name: "Switch tab"
        captureDelay: 50
        holdDuration: 1100
        actions:
          - { action: click, selector: "#tab-daily" }
      - name: "Table"
        captureDelay: 80
        holdDuration: 1300
        actions:
          - action: scroll
            y: 420
            smooth: true

  # ── timeline ──
  - type: motion
    template: kinetic-type
    duration: 2200
    props: { lines: "Ship *demos*,||not edits.", size: 86 }

  - type: vignette
    footage: demo
    duration: 4200
    layout: hero
    num: "01"
    label: "Cinematic camera"
    caption: "Recorded from a real app — *zero code changes*"
    push: { from: 1.02, to: 1.1 }
    start: { step: 0, offset: 0.15 }
    fx:
      - { kind: circle, selector: "#stat-users", delay: 2700 }

  - type: vignette
    footage: demo
    duration: 4000
    layout: crop
    num: "02"
    label: "Close-up"
    caption: "Selector-measured crop — *no pixel guessing*"
    crop: { selector: "#chart-area", pad: 14 }
    push: { from: 1.04, to: 1 }
    start: { step: 3 }
    rate: 1.1

  - type: motion
    template: kinetic-type
    duration: 1900
    props: { lines: "Your code,||*untouched.*", size: 80, fx: marker }

  - type: motion
    template: kinetic-type
    duration: 2600
    props: { lines: "*My Product*", size: 90, sub: "npx clipwise@latest init" }
`;

    const gitignore = `# Clipwise local artifacts — safe to ignore
auth/
output/
cache/
`;

    // Brand Kit — 영상의 톤앤매너와 캐치프레이즈를 한 곳에서 관리
    const brandTemplate = `# Brand Kit — tone & manner and copy for your videos.
# Motion templates (title/chapter cards) read this config.

product: "My Product"

# Tone preset: midnight | daylight | neon
#   midnight — deep black + soft glow (keynote tone, default)
#   daylight — light editorial (docs/blog tone)
#   neon     — deep purple + gradient typography (launch-hype tone)
tone: midnight

accent: "#6366f1"

# Font preset: editorial | grotesk | system
#   editorial — Inter + Instrument Serif italic emphasis (default)
#   grotesk   — Space Grotesk display (tech-launch mood)
#   system    — system fonts (no network needed)
font: editorial

# Line-draw emphasis — animated underlines/circles/arrows/markers
annotations: true

# Frequently used catchphrases / one-liners
tagline: "One line that sells your product"
catchphrases:
  intro: "Introducing My Feature"
  introSub: "What it does, in one sentence"
  outro: "My Product"
  outroSub: "npx my-product init"
`;

    await mkdir(join(baseDir, "scenarios"), { recursive: true });
    await mkdir(join(baseDir, "prepare"), { recursive: true });
    await mkdir(join(baseDir, "fixtures"), { recursive: true });
    await mkdir(join(baseDir, "auth"), { recursive: true });
    await writeFile(join(baseDir, "scenarios", "demo.yaml"), template, "utf-8");
    await writeFile(join(baseDir, "scenarios", "keynote.yaml"), keynoteTemplate, "utf-8");
    await writeFile(join(baseDir, "brand.yaml"), brandTemplate, "utf-8");
    await writeFile(join(baseDir, ".gitignore"), gitignore, "utf-8");

    console.log(chalk.green("Created .clipwise/\n"));
    console.log("  .clipwise/");
    console.log("    scenarios/keynote.yaml — keynote launch video (runs as-is!)");
    console.log("    scenarios/demo.yaml    — simple screen recording (edit the URL)");
    console.log("    brand.yaml             — tone & font presets + catchphrases");
    console.log("    prepare/               — CSS/JS injected only while recording");
    console.log("    fixtures/              — mocked API responses (JSON)");
    console.log("    auth/                  — storageState files (gitignored)");
    console.log(`\n${chalk.bold("Try it right now")} (no edits needed — records the hosted demo):`);
    console.log(`  ${chalk.bold("clipwise record .clipwise/scenarios/keynote.yaml")}`);
    console.log("\nThen make it yours:");
    console.log(`  1. Edit ${chalk.bold("keynote.yaml")} — swap the url + selectors for your app`);
    console.log(`  2. Edit ${chalk.bold("brand.yaml")} — your accent color & catchphrases`);
    console.log(`  3. Or let AI write scenarios: ${chalk.bold("clipwise install-skill")} → ask ${chalk.bold("/clipwise")} in Claude Code`);
    console.log(`\nOutput lands in ${chalk.bold(".clipwise/output/")} · remove every trace: ${chalk.bold("rm -rf .clipwise")}`);
    console.log(`Docs: ${chalk.bold("https://kwakseongjae.github.io/clipwise/")}\n`);
  });

program
  .command("demo")
  .description("Record a demo video of the Clipwise showcase dashboard")
  .option("-o, --output <dir>", "Output directory", ".clipwise/output")
  .option(
    "-f, --format <format>",
    "Output format (gif|mp4)",
    "mp4",
  )
  .option(
    "--url <url>",
    "Custom URL to record (default: Clipwise demo dashboard)",
  )
  .option(
    "--device <device>",
    "Device frame (browser|iphone|ipad|android)",
    "browser",
  )
  .action(async (options) => {
    const spinner = ora();

    try {
      const { loadScenario } = await import("../script/parser.js");

      // Resolve the bundled demo.yaml — works from dist/ or src/
      const demoYamlCandidates = [
        resolve(fileURLToPath(import.meta.url), "../../..", "examples", "demo.yaml"),    // from dist/cli/
        resolve(fileURLToPath(import.meta.url), "../..", "examples", "demo.yaml"),        // from src/cli/
      ];
      let demoYamlPath = "";
      for (const candidate of demoYamlCandidates) {
        if (existsSync(candidate)) { demoYamlPath = candidate; break; }
      }
      if (!demoYamlPath) {
        throw new Error("Cannot find examples/demo.yaml. Run from the project root.");
      }

      const scenario = await loadScenario(demoYamlPath);

      // Override output settings from CLI options
      scenario.output.format = options.format as "mp4" | "gif";
      scenario.output.outputDir = options.output;
      scenario.output.filename = `clipwise-demo-${options.device}`;

      // Override navigate URL: use --url flag, or default to the GitHub Pages
      // hosted demo site (demo.yaml uses a relative path that only works with
      // `clipwise record` which resolves URLs relative to the yaml file).
      const demoUrl = options.url ?? "https://kwakseongjae.github.io/clipwise/demo/";
      if (scenario.steps.length > 0) {
        const navAction = scenario.steps[0].actions.find((a: { action: string }) => a.action === "navigate");
        if (navAction && "url" in navAction) {
          (navAction as { url: string }).url = demoUrl;
        }
      }

      spinner.succeed(`Demo scenario ready: ${chalk.bold(scenario.name)}`);

      // Check browser
      spinner.start("Checking browser...");
      try {
        const { chromium } = await import("playwright");
        const testBrowser = await chromium.launch({ headless: true });
        await testBrowser.close();
        spinner.succeed("Browser ready");
      } catch {
        spinner.fail("Chromium not found");
        console.log(chalk.yellow("\nInstalling Chromium (one-time setup)...\n"));
        const { execSync } = await import("child_process");
        try {
          execSync("npx playwright install chromium", { stdio: "inherit" });
        } catch {
          console.error(chalk.red("\nFailed to install Chromium. Run: npx playwright install chromium\n"));
          process.exit(1);
        }
      }

      // Compose & encode
      await mkdir(options.output, { recursive: true });
      const demoRenderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
      const ext = scenario.output.format === "gif" ? "gif" : "mp4";
      const outputPath = join(options.output, `clipwise-demo-${options.device}.${ext}`);

      const isConcurrentEligible = ext === "mp4" && demoRenderer.canStreamOnline();

      if (isConcurrentEligible) {
        // Phase 3-B: record + compose run concurrently — single pass, no pre-recording.
        const recorder = new ClipwiseRecorder();
        const concPipeline = new ConcurrentSession(recorder, scenario, demoRenderer);
        concPipeline.on("progress", ({ composed, total, pct }: PipelineProgress) => {
          spinner.text = total > 0
            ? `Recording & composing... ${composed}/${total} (${pct}%)`
            : `Recording & composing... ${composed} frames`;
        });
        spinner.start(`Recording & composing ${scenario.steps.length} steps concurrently...`);
        const { buffer: buf, session } = await concPipeline.run();
        await writeFile(outputPath, buf);
        spinner.succeed(`MP4 saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB, ${session.frames.length} frames)`);
      } else {
        // Sequential: record first, then compose + encode
        spinner.start(`Recording ${scenario.steps.length} steps...`);
        const recorder = new ClipwiseRecorder();
        const session = await recorder.record(scenario);
        spinner.succeed(`Recorded ${session.frames.length} frames`);

        if (ext === "gif") {
          // GIF needs all frames upfront for palette quantization — batch compose
          spinner.start(`Applying effects to ${session.frames.length} frames...`);
          const composedFrames = await demoRenderer.composeAll(session.frames);
          spinner.succeed("Effects applied");
          spinner.start("Encoding GIF...");
          const buf = await encodeGif(composedFrames, scenario.output);
          await writeFile(outputPath, buf);
          spinner.succeed(`GIF saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB)`);
        } else {
          // Speed-ramp or other blocking effects: StreamingSession (sequential)
          const pipeline = new StreamingSession(session, demoRenderer);
          pipeline.on("progress", ({ composed, total, pct }: PipelineProgress) => {
            spinner.text = `Composing & encoding... ${composed}/${total} (${pct}%)`;
          });
          spinner.start(`Composing & encoding ${session.frames.length} frames...`);
          const buf = await pipeline.run();
          await writeFile(outputPath, buf);
          spinner.succeed(`MP4 saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB)`);
        }
      }

      console.log(chalk.green("\nDemo complete! 🎬"));
    } catch (error) {
      spinner.fail("Demo recording failed");
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
  });

program
  .command("install-skill")
  .description("Install the Clipwise skill for Claude Code")
  .option("--remove", "Remove an installed skill instead (symmetric cleanup)")
  .action(async (options) => {
    try {
      // --remove: 설치된 스킬 파일 제거 — .clipwise/ 밖에 남는 유일한
      // 흔적(.claude/skills/clipwise.md)의 대칭적 정리 경로
      if (options.remove) {
        const candidates = [
          join(resolve(".claude", "skills"), "clipwise.md"),
          join(homedir(), ".claude", "skills", "clipwise.md"),
        ];
        let removed = 0;
        for (const candidate of candidates) {
          try {
            await access(candidate);
            await rm(candidate);
            console.log(chalk.green(`Removed ${chalk.bold(candidate)}`));
            removed++;
          } catch {
            // Not installed at this location
          }
        }
        if (removed === 0) {
          console.log(chalk.yellow("No installed Clipwise skill found."));
        }
        return;
      }

      // Locate the skill source file bundled with clipwise
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const skillSource = resolve(__dirname, "..", "..", "skills", "clipwise.md");

      // Verify the skill file exists in the package
      try {
        await access(skillSource);
      } catch {
        console.error(chalk.red("Error: Skill file not found in clipwise package."));
        console.error(chalk.yellow("This may happen if you're running from source. Try: npm rebuild clipwise"));
        process.exit(1);
      }

      // Determine target directory: project-level .claude/skills/ first, fallback to global
      const projectSkillDir = resolve(".claude", "skills");
      const globalSkillDir = join(homedir(), ".claude", "skills");

      // Prefer project-level if .claude/ directory already exists in cwd
      let targetDir: string;
      try {
        await access(resolve(".claude"));
        targetDir = projectSkillDir;
      } catch {
        targetDir = globalSkillDir;
      }

      await mkdir(targetDir, { recursive: true });
      const targetPath = join(targetDir, "clipwise.md");

      // Check if already installed and up-to-date
      try {
        const existing = await readFile(targetPath, "utf-8");
        const incoming = await readFile(skillSource, "utf-8");
        if (existing === incoming) {
          console.log(chalk.green("Clipwise skill is already up to date."));
          console.log(`  Location: ${chalk.bold(targetPath)}`);
          console.log(`\nUse ${chalk.bold("/clipwise")} in Claude Code to get started.`);
          return;
        }
      } catch {
        // File doesn't exist yet, proceed with install
      }

      await copyFile(skillSource, targetPath);

      console.log(chalk.green("Clipwise skill installed successfully!"));
      console.log(`  Location: ${chalk.bold(targetPath)}`);
      console.log(`\nUsage in Claude Code:`);
      console.log(`  ${chalk.bold("/clipwise")} — Generate YAML scenarios, validate, and record demos`);
      console.log(`\nTo update the skill later, run this command again.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to install skill: ${message}`));
      process.exit(1);
    }
  });

program.parse();
