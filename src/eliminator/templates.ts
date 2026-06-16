import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { TemplatesConfig } from "../types/index.js";

/**
 * Loads, validates, and randomly selects elimination message templates
 * from a YAML configuration file.
 */
export class TemplateLoader {
  private templates: string[] = [];
  private readonly configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Load and validate the YAML configuration file.
   * Throws ENOENT if the file does not exist.
   * Throws a validation error if templates array is empty or contains empty strings.
   */
  load(): void {
    const raw = readFileSync(this.configPath, "utf-8");
    const parsed = yaml.load(raw) as TemplatesConfig;

    if (
      !parsed ||
      !parsed.elimination ||
      !Array.isArray(parsed.elimination.templates)
    ) {
      throw new Error(
        "Invalid templates config: elimination.templates must be an array",
      );
    }

    const templates = parsed.elimination.templates;

    if (templates.length === 0) {
      throw new Error(
        "Invalid templates config: elimination.templates must not be empty",
      );
    }

    for (const [i, t] of templates.entries()) {
      if (typeof t !== "string" || t.trim() === "") {
        throw new Error(
          `Invalid templates config: elimination.templates[${i}] must be a non-empty string`,
        );
      }
    }

    this.templates = templates;
  }

  /**
   * Randomly select one template from the loaded list.
   */
  pickRandom(): string {
    if (this.templates.length === 0) {
      throw new Error("No templates loaded. Call load() first.");
    }
    const idx = Math.floor(Math.random() * this.templates.length);
    return this.templates[idx];
  }

  /**
   * Return the number of loaded templates.
   */
  count(): number {
    return this.templates.length;
  }
}
