import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { AppConfig } from "../types/index.js";

/**
 * Recursively convert snake_case keys to camelCase.
 */
function camelCaseKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = camelCaseKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * Load and parse a YAML screening config file.
 */
export function loadConfig(filePath: string): AppConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown>;
  return camelCaseKeys(parsed) as AppConfig;
}

/**
 * Validate that a loaded config has all required fields.
 */
export function validateConfig(config: AppConfig): void {
  if (!config.positions || config.positions.length === 0) {
    throw new Error("Config must have at least one position");
  }

  for (const [i, pos] of config.positions.entries()) {
    if (!pos.name) {
      throw new Error(`Position[${i}]: name is required`);
    }
    if (!pos.bossUrl) {
      throw new Error(`Position[${i}]: bossUrl is required`);
    }
    if (!pos.screening) {
      throw new Error(`Position[${i}]: screening config is required`);
    }
    if (typeof pos.screening.passThreshold !== "number") {
      throw new Error(`Position[${i}]: passThreshold must be a number`);
    }
    if (!Array.isArray(pos.screening.required)) {
      throw new Error(`Position[${i}]: screening.required must be an array`);
    }
    if (!Array.isArray(pos.screening.preferred)) {
      throw new Error(`Position[${i}]: screening.preferred must be an array`);
    }
  }

  if (config.email) {
    const e = config.email;
    if (!e.smtpHost) throw new Error("email.smtpHost is required");
    if (!e.smtpUser) throw new Error("email.smtpUser is required");
    if (!e.to) throw new Error("email.to is required");
    if (!e.imapHost) throw new Error("email.imapHost is required");
    if (!e.imapUser) throw new Error("email.imapUser is required");
  }
}
