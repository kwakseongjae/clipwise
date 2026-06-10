import { parse as parseYaml } from "yaml";
import { readFile } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import { ScenarioSchema, Scenario } from "./types.js";
import { ZodError } from "zod";

/**
 * Parse a YAML string and return a validated Scenario object.
 * Throws with descriptive error messages on parse or validation failure.
 */
export function parseScenario(yamlContent: string): Scenario {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`YAML parse error: ${message}`);
  }

  try {
    return ScenarioSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues
        .map((issue) => {
          const path = issue.path.join(".");
          return `  - ${path ? `${path}: ` : ""}${issue.message}`;
        })
        .join("\n");
      throw new Error(`Scenario validation failed:\n${details}`);
    }
    throw error;
  }
}

/**
 * prepare 블록의 상대 경로(fixture, inject.css/js)를 시나리오 파일 위치
 * 기준 절대 경로로 변환한다.  `.clipwise/scenarios/` 어디에 시나리오를 두든
 * cwd와 무관하게 동작하도록 보장하는 Zero-Footprint 계약의 일부.
 */
export function resolvePreparePaths(scenario: Scenario, scenarioDir: string): void {
  const prepare = scenario.prepare;
  if (!prepare) return;

  const abs = (p: string) => (isAbsolute(p) ? p : resolve(scenarioDir, p));

  for (const mock of prepare.mock) {
    if (mock.fixture) mock.fixture = abs(mock.fixture);
  }
  if (prepare.inject?.css) {
    prepare.inject.css = Array.isArray(prepare.inject.css)
      ? prepare.inject.css.map(abs)
      : abs(prepare.inject.css);
  }
  if (prepare.inject?.js) {
    prepare.inject.js = Array.isArray(prepare.inject.js)
      ? prepare.inject.js.map(abs)
      : abs(prepare.inject.js);
  }
}

/**
 * Load and parse a scenario from a YAML file path.
 */
export async function loadScenario(filePath: string): Promise<Scenario> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown file error";
    throw new Error(`Failed to read scenario file "${filePath}": ${message}`);
  }

  const scenario = parseScenario(content);
  resolvePreparePaths(scenario, dirname(resolve(filePath)));
  return scenario;
}
