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
    expect(scenario.output.fps).toBe(30);
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

  it("accepts Korean/CJK unicode selectors", () => {
    const scenario = parseScenario(`
name: "Unicode selectors"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: click
        selector: "[data-label='한국어']"
      - action: click
        selector: ".日本語-class"
      - action: click
        selector: "#中文id"
`);
    expect(scenario.steps[0].actions).toHaveLength(4);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "click",
      selector: "[data-label='한국어']",
    });
  });

  it("rejects selectors with control characters", () => {
    expect(() =>
      parseScenario(`
name: "Bad selector"
steps:
  - actions:
      - action: click
        selector: "div\\x00"
`),
    ).toThrow("Scenario validation failed");
  });

  it("rejects selectors with semicolons or backticks", () => {
    expect(() =>
      parseScenario(`
name: "Bad selector"
steps:
  - actions:
      - action: click
        selector: "div; rm -rf /"
`),
    ).toThrow("Scenario validation failed");
  });

  it("parses timeout on click/type/hover/scroll actions", () => {
    const scenario = parseScenario(`
name: "With timeout"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: click
        selector: "#btn"
        timeout: 10000
      - action: type
        selector: "#input"
        text: "hello"
        timeout: 8000
      - action: hover
        selector: "#menu"
        timeout: 5000
`);
    const actions = scenario.steps[0].actions;
    expect(actions[1]).toMatchObject({ action: "click", timeout: 10000 });
    expect(actions[2]).toMatchObject({ action: "type", timeout: 8000 });
    expect(actions[3]).toMatchObject({ action: "hover", timeout: 5000 });
  });

  it("parses waitForSelector action", () => {
    const scenario = parseScenario(`
name: "Wait for selector"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForSelector
        selector: "#dynamic-element"
        state: attached
        timeout: 20000
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForSelector",
      selector: "#dynamic-element",
      state: "attached",
      timeout: 20000,
    });
  });

  it("parses waitForNavigation action", () => {
    const scenario = parseScenario(`
name: "Wait for navigation"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForNavigation
        waitUntil: load
        timeout: 10000
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForNavigation",
      waitUntil: "load",
      timeout: 10000,
    });
  });

  it("parses waitForURL action", () => {
    const scenario = parseScenario(`
name: "Wait for URL"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForURL
        url: "https://example.com/dashboard"
        timeout: 12000
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForURL",
      url: "https://example.com/dashboard",
      timeout: 12000,
    });
  });

  it("applies defaults for waitForSelector/waitForNavigation", () => {
    const scenario = parseScenario(`
name: "Defaults"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForSelector
        selector: ".item"
      - action: waitForNavigation
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForSelector",
      state: "visible",
      timeout: 15000,
    });
    expect(scenario.steps[0].actions[2]).toMatchObject({
      action: "waitForNavigation",
      waitUntil: "networkidle",
      timeout: 15000,
    });
  });

  it("parses waitForFunction with defaults", () => {
    const scenario = parseScenario(`
name: "Wait for function"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForFunction
        expression: "document.querySelector('.done') !== null"
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForFunction",
      expression: "document.querySelector('.done') !== null",
      polling: "raf",
      timeout: 30000,
    });
  });

  it("parses waitForFunction with numeric polling", () => {
    const scenario = parseScenario(`
name: "Wait for function polling"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForFunction
        expression: "document.querySelector('.output')?.textContent?.length > 100"
        polling: 500
        timeout: 60000
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForFunction",
      expression: "document.querySelector('.output')?.textContent?.length > 100",
      polling: 500,
      timeout: 60000,
    });
  });

  it("parses waitForResponse with status", () => {
    const scenario = parseScenario(`
name: "Wait for response"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForResponse
        url: "/api/chat/completions"
        status: 200
        timeout: 60000
`);
    expect(scenario.steps[0].actions[1]).toMatchObject({
      action: "waitForResponse",
      url: "/api/chat/completions",
      status: 200,
      timeout: 60000,
    });
  });

  it("parses waitForResponse with defaults", () => {
    const scenario = parseScenario(`
name: "Wait for response defaults"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
      - action: waitForResponse
        url: "/api/generate"
`);
    const action = scenario.steps[0].actions[1];
    expect(action).toMatchObject({
      action: "waitForResponse",
      url: "/api/generate",
      timeout: 30000,
    });
    expect((action as any).status).toBeUndefined();
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
