import { describe, it, expect } from "vitest";
import { parseScenario } from "../src/script/parser.js";

const VALID_YAML = `
name: "Test Scenario"
description: "A simple test"
viewport:
  width: 1280
  height: 800
steps:
  - name: "Navigate"
    actions:
      - action: navigate
        url: "https://example.com"
`;

const MINIMAL_YAML = `
name: "Minimal"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`;

describe("parseScenario", () => {
  it("parses a valid YAML scenario", () => {
    const scenario = parseScenario(VALID_YAML);
    expect(scenario.name).toBe("Test Scenario");
    expect(scenario.description).toBe("A simple test");
    expect(scenario.viewport.width).toBe(1280);
    expect(scenario.viewport.height).toBe(800);
    expect(scenario.steps).toHaveLength(1);
    expect(scenario.steps[0].actions[0].action).toBe("navigate");
  });

  it("applies defaults for missing optional fields", () => {
    const scenario = parseScenario(MINIMAL_YAML);
    expect(scenario.viewport.width).toBe(1280);
    expect(scenario.viewport.height).toBe(800);
    expect(scenario.output.format).toBe("gif");
    expect(scenario.output.fps).toBe(15);
    expect(scenario.effects.zoom.enabled).toBe(true);
    expect(scenario.effects.cursor.enabled).toBe(true);
    expect(scenario.effects.background.type).toBe("gradient");
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => parseScenario("{ invalid yaml :::")).toThrow("YAML parse error");
  });

  it("throws on missing required fields", () => {
    expect(() => parseScenario("description: no name field")).toThrow(
      "Scenario validation failed",
    );
  });

  it("throws on empty steps array", () => {
    expect(() =>
      parseScenario(`
name: "Empty"
steps: []
`),
    ).toThrow("Scenario validation failed");
  });

  it("validates action types", () => {
    const scenario = parseScenario(`
name: "Multi-action"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: click
        selector: "#btn"
      - action: wait
        duration: 500
      - action: screenshot
`);
    expect(scenario.steps[0].actions).toHaveLength(4);
  });

  it("parses effects configuration", () => {
    const scenario = parseScenario(`
name: "With effects"
effects:
  zoom:
    enabled: false
    scale: 2.0
  cursor:
    size: 30
    color: "#ff0000"
  background:
    type: solid
    value: "#000000"
    padding: 40
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`);
    expect(scenario.effects.zoom.enabled).toBe(false);
    expect(scenario.effects.zoom.scale).toBe(2.0);
    expect(scenario.effects.cursor.size).toBe(30);
    expect(scenario.effects.background.type).toBe("solid");
    expect(scenario.effects.background.padding).toBe(40);
  });
});
