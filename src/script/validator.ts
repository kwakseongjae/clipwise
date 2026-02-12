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
