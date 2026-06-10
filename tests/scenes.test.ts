import { describe, it, expect } from "vitest";
import { parseScenario } from "../src/script/parser.js";
import { validateScenario } from "../src/script/validator.js";

const SCENES_YAML = `
name: "Scenes Test"
output: { format: mp4 }
scenes:
  - type: motion
    template: kinetic-type
    duration: 2000
    props: { lines: "Hello *world*", size: 80 }

  - type: screen
    id: demo
    steps:
      - actions:
          - action: navigate
            url: "https://example.com"
          - action: click
            selector: "#btn"

  - type: vignette
    footage: demo
    duration: 4000
    layout: crop
    num: "01"
    label: "Close-up"
    caption: "with *emphasis*"
    crop: { selector: ".panel", pad: 10, maxH: 260 }
    push: { from: 1, to: 1.08 }
    start: { step: 1, offset: 0.2 }
    rate: 1.2
    fx:
      - { kind: circle, selector: "#btn", delay: 1500 }
`;

describe("Scene System schema (v0.9 preview)", () => {
  it("parses a scenes timeline without top-level steps", () => {
    const s = parseScenario(SCENES_YAML);
    expect(s.steps).toEqual([]);
    expect(s.scenes).toHaveLength(3);
    expect(s.scenes![0].type).toBe("motion");
    expect(s.scenes![1].type).toBe("screen");
    const v = s.scenes![2];
    expect(v.type).toBe("vignette");
    if (v.type === "vignette") {
      expect(v.crop?.maxH).toBe(260);
      expect(v.start).toEqual({ step: 1, offset: 0.2 });
      expect(v.fx[0].kind).toBe("circle");
      expect(v.rate).toBe(1.2);
    }
  });

  it("applies scene defaults", () => {
    const s = parseScenario(`
name: "Defaults"
scenes:
  - { type: motion, template: intro-title, duration: 2000 }
  - type: screen
    id: a
    steps: [{ actions: [{ action: navigate, url: "https://x.com" }] }]
  - { type: vignette, footage: a, duration: 3000 }
`);
    const v = s.scenes![2];
    if (v.type === "vignette") {
      expect(v.layout).toBe("hero");
      expect(v.rate).toBe(1);
      expect(v.start).toBe(0);
      expect(v.fx).toEqual([]);
    }
  });

  it("still rejects a scenario with neither steps nor scenes", () => {
    expect(() => parseScenario(`name: "Empty"\nsteps: []`)).toThrow("Scenario validation failed");
  });

  it("rejects unknown scene type via discriminated union", () => {
    expect(() =>
      parseScenario(`name: "Bad"\nscenes:\n  - { type: nonsense, duration: 1000 }`),
    ).toThrow("Scenario validation failed");
  });
});

describe("validateScenario (scenes logic)", () => {
  it("errors on vignette referencing unknown footage", () => {
    const s = parseScenario(`
name: "Bad ref"
scenes:
  - { type: vignette, footage: ghost, duration: 3000 }
`);
    const r = validateScenario(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('unknown footage "ghost"'))).toBe(true);
  });

  it("errors when screen scene does not start with navigate", () => {
    const s = parseScenario(`
name: "No nav"
scenes:
  - type: screen
    id: a
    steps: [{ actions: [{ action: click, selector: "#x" }] }]
  - { type: vignette, footage: a, duration: 3000 }
`);
    const r = validateScenario(s);
    expect(r.errors.some((e) => e.includes('screen "a" must start with a navigate'))).toBe(true);
  });

  it("errors when timeline has only screen scenes or non-mp4 output", () => {
    const s = parseScenario(`
name: "Footage only"
output: { format: gif }
scenes:
  - type: screen
    id: a
    steps: [{ actions: [{ action: navigate, url: "https://x.com" }] }]
`);
    const r = validateScenario(s);
    expect(r.errors.some((e) => e.includes("at least one motion or vignette"))).toBe(true);
    expect(r.errors.some((e) => e.includes("requires output.format mp4"))).toBe(true);
  });

  it("errors on fx without selector or coords", () => {
    const s = parseScenario(`
name: "Bad fx"
scenes:
  - type: screen
    id: a
    steps: [{ actions: [{ action: navigate, url: "https://x.com" }] }]
  - type: vignette
    footage: a
    duration: 3000
    fx: [{ kind: circle }]
`);
    const r = validateScenario(s);
    expect(r.errors.some((e) => e.includes('needs "selector" or "coords"'))).toBe(true);
  });

  it("accepts a valid scenes timeline", () => {
    const r = validateScenario(parseScenario(SCENES_YAML));
    expect(r.valid).toBe(true);
  });
});
