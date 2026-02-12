import { parse as parseYaml } from "yaml";
import { readFile } from "fs/promises";
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

  return parseScenario(content);
}
