import { describe, it, expect } from "vitest";
import { loadConfig, validateConfig } from "../../src/config/loader.js";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("loadConfig", () => {
  it("loads and parses a valid YAML config", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    expect(config.positions).toHaveLength(1);
    expect(config.positions[0].name).toBe("Test Position");
    expect(config.positions[0].bossUrl).toBe("https://www.zhipin.com/web/geek/chat");
  });

  it("converts snake_case YAML keys to camelCase", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    const pos = config.positions[0];
    expect(pos.screening.passThreshold).toBe(10);
    // required[0] is the status/not_in rule; required[1] is the skills/contains_any rule
    expect(pos.screening.required[0].notIn).toEqual(["在职-暂不考虑"]);
    expect(pos.screening.required[1].containsAny).toEqual(["k8s", "kubernetes"]);
  });

  it("converts snake_case contains_any to containsAny", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    const preferred = config.positions[0].screening.preferred[0];
    expect(preferred.containsAny).toEqual(["docker"]);
    expect(preferred.weight).toBe(10);
  });
});

describe("validateConfig", () => {
  it("accepts valid config", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("rejects config with no positions", () => {
    expect(() => validateConfig({ positions: [] })).toThrow("at least one position");
  });

  it("rejects position without name", () => {
    expect(() =>
      validateConfig({
        positions: [
          { name: "", bossUrl: "https://x.com", screening: { required: [], preferred: [], passThreshold: 10 } },
        ],
      }),
    ).toThrow("name");
  });

  it("rejects position without bossUrl", () => {
    expect(() =>
      validateConfig({
        positions: [
          { name: "Test", bossUrl: "", screening: { required: [], preferred: [], passThreshold: 10 } },
        ],
      }),
    ).toThrow("bossUrl");
  });
});
