#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { loadScenario } from "../script/parser.js";
import { validateScenario } from "../script/validator.js";
import { ClipwiseRecorder } from "../core/recorder.js";
import { CanvasRenderer } from "../compose/canvas-renderer.js";
import { encodeGif, encodeMp4, savePngSequence } from "../compose/video-encoder.js";
import { writeFile, mkdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { pathToFileURL } from "url";

const program = new Command();

program
  .name("clipwise")
  .description(
    "Playwright-based cinematic screen recorder for product demos",
  )
  .version("0.1.0");

program
  .command("record")
  .description("Record a demo from a YAML scenario file")
  .argument("<scenario>", "Path to YAML scenario file")
  .option("-o, --output <dir>", "Output directory", "./output")
  .option(
    "-f, --format <format>",
    "Output format (gif|mp4|png-sequence)",
    "gif",
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

      // Override output settings from CLI options
      scenario.output.outputDir = options.output;
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

      // 4. Record (continuous CDP screencast capture)
      spinner.start(
        `Recording ${scenario.steps.length} steps...`,
      );
      const recorder = new ClipwiseRecorder();
      const session = await recorder.record(scenario);
      spinner.succeed(
        `Recorded ${session.frames.length} frames`,
      );

      // 5. Compose effects
      let composedFrames;
      if (options.effects !== false) {
        spinner.start(`Applying effects to ${session.frames.length} frames...`);
        const renderer = new CanvasRenderer(
          scenario.effects,
          scenario.output,
          scenario.steps,
        );
        composedFrames = await renderer.composeAll(session.frames);
        spinner.succeed("Effects applied");
      } else {
        // Convert captured frames to composed frames without effects
        composedFrames = session.frames.map((f) => ({
          index: f.index,
          buffer: f.screenshot,
          timestamp: f.timestamp,
        }));
        spinner.info("Effects disabled, using raw frames");
      }

      // 6. Encode & save
      await mkdir(options.output, { recursive: true });

      if (scenario.output.format === "png-sequence") {
        spinner.start("Saving PNG sequence...");
        const paths = await savePngSequence(
          composedFrames,
          scenario.output,
        );
        spinner.succeed(
          `Saved ${paths.length} frames to ${chalk.bold(options.output)}`,
        );
      } else if (scenario.output.format === "mp4") {
        spinner.start("Encoding MP4...");
        const mp4Buffer = await encodeMp4(
          composedFrames,
          scenario.output,
        );
        const outputPath = join(
          options.output,
          `${scenario.output.filename}.mp4`,
        );
        await writeFile(outputPath, mp4Buffer);
        const sizeMB = (mp4Buffer.length / (1024 * 1024)).toFixed(2);
        spinner.succeed(
          `MP4 saved to ${chalk.bold(outputPath)} (${sizeMB} MB)`,
        );
      } else {
        spinner.start("Encoding GIF...");
        const gifBuffer = await encodeGif(
          composedFrames,
          scenario.output,
        );
        const outputPath = join(
          options.output,
          `${scenario.output.filename}.gif`,
        );
        await writeFile(outputPath, gifBuffer);
        const sizeMB = (gifBuffer.length / (1024 * 1024)).toFixed(2);
        spinner.succeed(
          `GIF saved to ${chalk.bold(outputPath)} (${sizeMB} MB)`,
        );
      }

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
  .description("Create a template clipwise.yaml in the current directory")
  .action(async () => {
    const targetPath = resolve("clipwise.yaml");

    try {
      await access(targetPath);
      console.log(chalk.yellow("Warning: clipwise.yaml already exists in this directory."));
      console.log(chalk.yellow("Remove it first if you want to generate a fresh template.\n"));
      process.exit(1);
    } catch {
      // File doesn't exist, proceed
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

output:
  format: mp4
  fps: 30
  quality: 80

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

    await writeFile(targetPath, template, "utf-8");

    console.log(chalk.green("Created clipwise.yaml\n"));
    console.log("Next steps:");
    console.log(`  1. Edit ${chalk.bold("clipwise.yaml")} — change the URL to your site`);
    console.log(`  2. Run ${chalk.bold("clipwise record clipwise.yaml -f mp4")} to record`);
    console.log(`  3. Find your output in ${chalk.bold("./output/")}`);
    console.log(`\nOr try the built-in demo: ${chalk.bold("clipwise demo")}\n`);
  });

program
  .command("demo")
  .description("Record a demo video of the Clipwise showcase dashboard")
  .option("-o, --output <dir>", "Output directory", "./output")
  .option(
    "-f, --format <format>",
    "Output format (gif|mp4)",
    "mp4",
  )
  .option(
    "--url <url>",
    "Custom demo site URL (default: bundled demo site)",
  )
  .option(
    "--device <device>",
    "Device frame (browser|iphone|ipad|android)",
    "browser",
  )
  .action(async (options) => {
    const spinner = ora();

    try {
      // Determine the demo URL
      let demoUrl = options.url;
      if (!demoUrl) {
        // Use the bundled demo site from the package
        const pkgDir = dirname(dirname(resolve(import.meta.url.replace("file://", ""))));
        const demoPath = join(pkgDir, "examples", "demo-site", "dashboard.html");
        try {
          await access(demoPath);
          demoUrl = pathToFileURL(demoPath).href;
        } catch {
          // Fallback: try relative to cwd
          const cwdDemo = resolve("examples", "demo-site", "dashboard.html");
          try {
            await access(cwdDemo);
            demoUrl = pathToFileURL(cwdDemo).href;
          } catch {
            console.error(chalk.red("Demo site not found. Provide a URL with --url"));
            process.exit(1);
          }
        }
      }

      const device = options.device as string;
      const isMobile = device === "iphone" || device === "android";
      const isTablet = device === "ipad";
      const vpWidth = isMobile ? 390 : isTablet ? 1024 : 1280;
      const vpHeight = isMobile ? 844 : isTablet ? 768 : 800;
      const outWidth = isMobile ? 540 : 1280;
      const outHeight = isMobile ? 1080 : isTablet ? 960 : 800;

      // Build inline scenario
      const { parseScenario } = await import("../script/parser.js");
      const yaml = await import("yaml");

      const steps = [
        { name: "Load dashboard", captureDelay: 100, holdDuration: 1000,
          actions: [{ action: "navigate", url: demoUrl, waitUntil: "load" }] },
        { name: "Hover Users stat", captureDelay: 50, holdDuration: 700,
          actions: [{ action: "hover", selector: "#stat-users" }] },
        { name: "Hover Revenue", captureDelay: 50, holdDuration: 700,
          actions: [{ action: "hover", selector: "#stat-revenue" }] },
        { name: "Switch chart", captureDelay: 50, holdDuration: 800,
          actions: [{ action: "click", selector: "#tab-monthly" }] },
        { name: "Search", captureDelay: 50, holdDuration: 800,
          actions: [
            { action: "click", selector: "#search-input" },
            { action: "type", selector: "#search-input", text: "conversion", delay: 18 },
          ] },
        ...(!isMobile ? [{ name: "Scroll to projects", captureDelay: 100, holdDuration: 600,
          actions: [{ action: "scroll", y: 420, smooth: true }] }] :
          [{ name: "Scroll to chart", captureDelay: 100, holdDuration: 600,
          actions: [{ action: "scroll", y: 250, smooth: true }] }]),
        { name: "Hover row", captureDelay: 50, holdDuration: 600,
          actions: [{ action: "hover", selector: "#row-1" }] },
        { name: "Open modal", captureDelay: 100, holdDuration: 800,
          actions: [{ action: "click", selector: "#btn-new-project" }] },
        { name: "Type name", captureDelay: 50, holdDuration: 600,
          actions: [
            { action: "click", selector: "#project-name" },
            { action: "type", selector: "#project-name", text: "Clipwise Demo", delay: 20 },
          ] },
        { name: "Type desc", captureDelay: 50, holdDuration: 600,
          actions: [
            { action: "click", selector: "#project-desc" },
            { action: "type", selector: "#project-desc", text: "Automated screen recording", delay: 16 },
          ] },
        { name: "Create", captureDelay: 100, holdDuration: 1000,
          actions: [{ action: "click", selector: "#btn-create" }] },
      ];

      const scenarioObj = {
        name: `Clipwise Demo (${device})`,
        viewport: { width: vpWidth, height: vpHeight },
        effects: {
          zoom: { enabled: true, scale: 1.8, duration: 500,
            autoZoom: { followCursor: true, maxScale: 2.0 } },
          cursor: { enabled: true, size: isMobile ? 16 : 20, clickEffect: true,
            highlight: true, trail: !isMobile, trailLength: 6 },
          background: { type: "gradient",
            value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            padding: isMobile ? 60 : 48, borderRadius: 14, shadow: true },
          deviceFrame: { enabled: true, type: device, darkMode: true },
          keystroke: { enabled: true, position: "bottom-center",
            fontSize: isMobile ? 14 : 16 },
          watermark: { enabled: true, text: "Clipwise", position: "bottom-right",
            opacity: 0.35, fontSize: 13 },
        },
        output: {
          format: options.format, width: outWidth, height: outHeight,
          fps: 30, quality: 80,
          outputDir: options.output, filename: `clipwise-demo-${device}`,
        },
        steps,
      };

      const scenario = parseScenario(yaml.stringify(scenarioObj));
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

      // Record
      spinner.start(`Recording ${scenario.steps.length} steps...`);
      const recorder = new ClipwiseRecorder();
      const session = await recorder.record(scenario);
      spinner.succeed(`Recorded ${session.frames.length} frames`);

      // Compose
      spinner.start(`Applying effects to ${session.frames.length} frames...`);
      const renderer = new CanvasRenderer(scenario.effects, scenario.output, scenario.steps);
      const composedFrames = await renderer.composeAll(session.frames);
      spinner.succeed("Effects applied");

      // Encode
      await mkdir(options.output, { recursive: true });
      const ext = scenario.output.format === "gif" ? "gif" : "mp4";
      const outputPath = join(options.output, `clipwise-demo-${device}.${ext}`);

      if (ext === "gif") {
        spinner.start("Encoding GIF...");
        const buf = await encodeGif(composedFrames, scenario.output);
        await writeFile(outputPath, buf);
        spinner.succeed(`GIF saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB)`);
      } else {
        spinner.start("Encoding MP4...");
        const buf = await encodeMp4(composedFrames, scenario.output);
        await writeFile(outputPath, buf);
        spinner.succeed(`MP4 saved to ${chalk.bold(outputPath)} (${(buf.length / 1048576).toFixed(2)} MB)`);
      }

      console.log(chalk.green("\nDemo complete! 🎬"));
    } catch (error) {
      spinner.fail("Demo recording failed");
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}`));
      process.exit(1);
    }
  });

program.parse();
