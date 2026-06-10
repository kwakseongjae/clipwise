import { describe, it, expect } from "vitest";
import { parseScenario, resolvePreparePaths } from "../src/script/parser.js";
import { validateScenario } from "../src/script/validator.js";
import {
  buildHideCss,
  buildCssInjectionScript,
  buildFreezeTimeScript,
  buildSeedRandomScript,
  buildStorageScript,
} from "../src/core/prepare.js";

const BASE_YAML = `
name: "Prepare Test"
steps:
  - actions:
      - action: navigate
        url: "https://example.com"
`;

describe("PrepareConfigSchema (YAML parsing)", () => {
  it("parses a full prepare block", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  hide:
    - "#cookie-banner"
    - "[data-nextjs-toast]"
  freezeTime: "2026-06-10T09:00:00Z"
  seedRandom: 42
  storage:
    localStorage:
      onboarding_done: "true"
  mock:
    - url: "/api/stats"
      fixture: ./fixtures/stats.json
    - url: "/api/user"
      body: { name: "Demo User" }
      status: 200
  inject:
    css: ./prepare/demo.css
    js:
      - ./prepare/a.js
      - ./prepare/b.js
`);
    const prepare = scenario.prepare!;
    expect(prepare.hide).toEqual(["#cookie-banner", "[data-nextjs-toast]"]);
    expect(prepare.freezeTime).toBe("2026-06-10T09:00:00Z");
    expect(prepare.seedRandom).toBe(42);
    expect(prepare.storage?.localStorage.onboarding_done).toBe("true");
    expect(prepare.mock).toHaveLength(2);
    expect(prepare.mock[0].fixture).toBe("./fixtures/stats.json");
    expect(prepare.mock[1].body).toEqual({ name: "Demo User" });
    expect(prepare.mock[1].contentType).toBe("application/json");
    expect(prepare.inject?.css).toBe("./prepare/demo.css");
    expect(prepare.inject?.js).toEqual(["./prepare/a.js", "./prepare/b.js"]);
  });

  it("is fully optional — scenarios without prepare still parse", () => {
    const scenario = parseScenario(BASE_YAML);
    expect(scenario.prepare).toBeUndefined();
  });

  it("applies defaults inside prepare", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  freezeTime: "2026-06-10T09:00:00Z"
`);
    expect(scenario.prepare!.hide).toEqual([]);
    expect(scenario.prepare!.mock).toEqual([]);
  });

  it("rejects invalid mock status codes", () => {
    expect(() =>
      parseScenario(`${BASE_YAML}
prepare:
  mock:
    - url: "/api"
      body: {}
      status: 99
`),
    ).toThrow("Scenario validation failed");
  });
});

describe("validateScenario (prepare logic)", () => {
  it("errors when a mock has neither fixture nor body", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  mock:
    - url: "/api/stats"
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('either "fixture" or "body"'))).toBe(true);
  });

  it("warns when a mock has both fixture and body", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  mock:
    - url: "/api/stats"
      fixture: ./stats.json
      body: {}
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("fixture takes precedence"))).toBe(true);
  });

  it("errors on unparseable freezeTime", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  freezeTime: "not-a-date"
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("freezeTime"))).toBe(true);
  });

  it("accepts a valid prepare block", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  hide: ["#banner"]
  freezeTime: "2026-06-10T09:00:00Z"
  mock:
    - url: "/api"
      body: { ok: true }
`);
    const result = validateScenario(scenario);
    expect(result.valid).toBe(true);
  });
});

describe("resolvePreparePaths", () => {
  it("resolves fixture and inject paths relative to the scenario directory", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  mock:
    - url: "/api/stats"
      fixture: ../fixtures/stats.json
  inject:
    css: ./demo.css
    js:
      - ./a.js
`);
    resolvePreparePaths(scenario, "/repo/.clipwise/scenarios");
    expect(scenario.prepare!.mock[0].fixture).toBe("/repo/.clipwise/fixtures/stats.json");
    expect(scenario.prepare!.inject!.css).toBe("/repo/.clipwise/scenarios/demo.css");
    expect(scenario.prepare!.inject!.js).toEqual(["/repo/.clipwise/scenarios/a.js"]);
  });

  it("leaves absolute paths untouched", () => {
    const scenario = parseScenario(`${BASE_YAML}
prepare:
  mock:
    - url: "/api"
      fixture: /abs/fixtures/data.json
`);
    resolvePreparePaths(scenario, "/repo/.clipwise/scenarios");
    expect(scenario.prepare!.mock[0].fixture).toBe("/abs/fixtures/data.json");
  });
});

describe("prepare script builders", () => {
  it("buildHideCss combines selectors with !important rules", () => {
    const css = buildHideCss(["#banner", ".toast"]);
    expect(css).toContain("#banner");
    expect(css).toContain(".toast");
    expect(css).toContain("display: none !important");
  });

  it("buildCssInjectionScript embeds CSS as a JSON string (injection-safe)", () => {
    const script = buildCssInjectionScript(`.a { content: "</style>"; }`);
    // CSS는 JSON 문자열로 이스케이프되어 script 컨텍스트를 깨지 않아야 한다
    expect(script).toContain(JSON.stringify(`.a { content: "</style>"; }`));
    expect(script).toContain("DOMContentLoaded");
  });

  it("buildFreezeTimeScript freezes Date.now and bare new Date()", () => {
    const epoch = Date.parse("2026-06-10T09:00:00Z");
    const script = buildFreezeTimeScript(epoch);
    // 가짜 globalThis를 파라미터로 주입해 테스트 러너의 실제 Date 오염 없이 실행
    const sandbox: { Date?: DateConstructor } = {};
    new Function("globalThis", script)(sandbox);
    const FrozenDate = sandbox.Date!;
    expect(FrozenDate.now()).toBe(epoch);
    expect(new FrozenDate().getTime()).toBe(epoch);
    // 인자 있는 생성과 정적 메서드는 원본 동작 유지
    expect(new FrozenDate(0).getTime()).toBe(0);
    expect(FrozenDate.parse("1970-01-01T00:00:01Z")).toBe(1000);
  });

  it("buildSeedRandomScript produces an identical sequence per seed", () => {
    // 스크립트를 함수 스코프에서 실행해 대체된 Math.random의 결정론을 검증
    const run = (seed: number) => {
      const sandbox = { Math: { imul: Math.imul, random: Math.random } };
      new Function("Math", buildSeedRandomScript(seed))(sandbox.Math);
      return [sandbox.Math.random(), sandbox.Math.random(), sandbox.Math.random()];
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
    for (const v of run(42)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("buildStorageScript embeds entries as JSON (injection-safe)", () => {
    const script = buildStorageScript({
      localStorage: { key: `"quoted" </script>` },
      sessionStorage: {},
    });
    expect(script).toContain(JSON.stringify({ localStorage: { key: `"quoted" </script>` }, sessionStorage: {} }));
    expect(script).toContain("localStorage.setItem");
  });
});
