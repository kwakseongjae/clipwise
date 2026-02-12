import { describe, it, expect } from "vitest";
import { validateScenario } from "../src/script/validator.js";
import { parseScenario } from "../src/script/parser.js";

function buildScenario(yaml: string) {
  return parseScenario(yaml);
}

describe("validateScenario", () => {
  it("passes for a valid scenario", () => {
    const scenario = buildScenario(`
name: "Valid"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when first step has no navigate action", () => {
    const scenario = buildScenario(`
name: "No navigate"
steps:
  - actions:
      - action: click
        selector: "#btn"
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("navigate"))).toBe(true);
  });

  it("fails when selector is empty", () => {
    const scenario = buildScenario(`
name: "Empty selector"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
  - actions:
      - action: click
        selector: "   "
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("selector"))).toBe(true);
  });

  it("warns when fps is above 30", () => {
    const scenario = buildScenario(`
name: "High FPS"
output:
  fps: 60
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("FPS"))).toBe(true);
  });

  it("warns when viewport and output dimensions differ", () => {
    const scenario = buildScenario(`
name: "Mismatched dims"
viewport:
  width: 1920
  height: 1080
output:
  width: 1280
  height: 800
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`);
    const result = validateScenario(scenario);
    expect(result.warnings.some((w) => w.includes("scaled"))).toBe(true);
  });
});
