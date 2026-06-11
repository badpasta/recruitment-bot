import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../src/utils/logger.js";

describe("createLogger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prefixes messages with module name", () => {
    const logger = createLogger("scraper");
    logger.info("Connected to browser");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[scraper]"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Connected to browser"),
    );
  });

  it("supports warn and error levels", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger("store");

    logger.warn("slow query");
    logger.error("write failed");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[store]"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[store]"));

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
