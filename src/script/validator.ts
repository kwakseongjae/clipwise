import type { Scenario } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the logical consistency of a parsed Scenario.
 * This performs checks beyond what Zod schema validation covers.
 */
export function validateScenario(scenario: Scenario): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Scene System (v0.9 preview) 검증
  if (scenario.scenes?.length) {
    const screenIds = new Set(
      scenario.scenes.filter((s) => s.type === "screen").map((s) => (s as { id: string }).id),
    );
    const timeline = scenario.scenes.filter((s) => s.type !== "screen");
    if (timeline.length === 0) {
      errors.push("scenes: at least one motion or vignette scene is required (screen scenes are footage sources only)");
    }
    if (scenario.output.format !== "mp4") {
      errors.push(`scenes timeline requires output.format mp4 (got "${scenario.output.format}")`);
    }
    for (const scene of scenario.scenes) {
      if (scene.type === "screen") {
        const hasNavigate = scene.steps[0]?.actions.some((a) => a.action === "navigate");
        if (!hasNavigate) {
          errors.push(`scenes: screen "${scene.id}" must start with a navigate action`);
        }
      } else if (scene.type === "vignette") {
        if (!screenIds.has(scene.footage)) {
          errors.push(`scenes: vignette references unknown footage "${scene.footage}"`);
        }
        for (const fx of scene.fx) {
          if (!fx.selector && !fx.coords) {
            errors.push(`scenes: vignette fx (${fx.kind}) needs "selector" or "coords"`);
          }
        }
        if (scene.crop && !scene.crop.selector && scene.crop.w === undefined) {
          warnings.push('scenes: vignette crop without selector/coords falls back to full frame');
        }
      }
    }
  }

  // 캡션 트랙 검증
  for (let i = 0; i < scenario.captions.length; i++) {
    const c = scenario.captions[i];
    if (c.end <= c.start) {
      errors.push(`captions #${i + 1} ("${c.text.slice(0, 20)}"): end must be greater than start`);
    }
  }
  if (scenario.captions.length > 0 && !scenario.scenes?.length) {
    warnings.push("captions are only rendered in scenes timelines (ignored for classic steps recordings)");
  }

  // Check that the first step contains a navigate action
  if (scenario.steps.length > 0) {
    const firstStep = scenario.steps[0];
    const hasNavigate = firstStep.actions.some(
      (a) => a.action === "navigate",
    );
    if (!hasNavigate) {
      errors.push(
        'First step must contain a "navigate" action to open a page',
      );
    }
  }

  // Validate selectors are not empty strings
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const stepLabel = step.name ? `"${step.name}"` : `#${i + 1}`;

    for (let j = 0; j < step.actions.length; j++) {
      const action = step.actions[j];

      if ("selector" in action && action.selector !== undefined) {
        const selector = action.selector as string;
        if (selector.trim() === "") {
          errors.push(
            `Step ${stepLabel}, action #${j + 1} (${action.action}): selector must not be empty`,
          );
        }
      }
    }
  }

  // Validate viewport dimensions are within a reasonable range
  const { width, height } = scenario.viewport;
  if (width < 100 || width > 3840) {
    errors.push(
      `Viewport width ${width} is out of range (must be 100-3840)`,
    );
  }
  if (height < 100 || height > 3840) {
    errors.push(
      `Viewport height ${height} is out of range (must be 100-3840)`,
    );
  }

  // Validate output dimensions
  const output = scenario.output;
  if (output.width < 100 || output.width > 3840) {
    errors.push(
      `Output width ${output.width} is out of range (must be 100-3840)`,
    );
  }
  if (output.height < 100 || output.height > 3840) {
    errors.push(
      `Output height ${output.height} is out of range (must be 100-3840)`,
    );
  }

  // Validate prepare block (recording-time injection)
  if (scenario.prepare) {
    const prepare = scenario.prepare;

    if (prepare.freezeTime && Number.isNaN(Date.parse(prepare.freezeTime))) {
      errors.push(
        `prepare.freezeTime "${prepare.freezeTime}" is not a valid date (use ISO 8601, e.g. "2026-06-10T09:00:00Z")`,
      );
    }

    for (let i = 0; i < prepare.mock.length; i++) {
      const mock = prepare.mock[i];
      if (!mock.fixture && mock.body === undefined) {
        errors.push(
          `prepare.mock #${i + 1} ("${mock.url}"): either "fixture" or "body" is required`,
        );
      }
      if (mock.fixture && mock.body !== undefined) {
        warnings.push(
          `prepare.mock #${i + 1} ("${mock.url}"): both "fixture" and "body" set — fixture takes precedence`,
        );
      }
    }

    for (const selector of prepare.hide) {
      if (selector.trim() === "") {
        errors.push("prepare.hide: selector must not be empty");
      }
    }
  }

  // Warnings for common issues
  if (output.fps > 30) {
    warnings.push(
      `FPS is set to ${output.fps}. High FPS may produce very large files.`,
    );
  }

  if (output.format === "gif" && output.quality > 90) {
    warnings.push(
      "GIF quality above 90 has diminishing returns and increases file size significantly.",
    );
  }

  if (scenario.viewport.width !== output.width || scenario.viewport.height !== output.height) {
    warnings.push(
      "Viewport dimensions differ from output dimensions. Output will be scaled.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
