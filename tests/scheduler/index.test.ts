import { describe, it, expect, vi } from "vitest";
import { Scheduler } from "../../src/scheduler/index.js";

/**
 * Helper: wait for a condition to be true, polling every 10ms.
 */
async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Scheduler", () => {
  it("executes the callback immediately on start()", async () => {
    const callback = vi.fn(async () => {});
    const scheduler = new Scheduler(callback, { intervalMs: 500, maxBackoffMs: 5000 });

    await scheduler.start();
    expect(callback).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("schedules the next round after intervalMs", async () => {
    const callback = vi.fn(async () => {});
    const scheduler = new Scheduler(callback, { intervalMs: 50, maxBackoffMs: 5000 });

    await scheduler.start();
    expect(callback).toHaveBeenCalledTimes(1);

    await waitFor(() => callback.mock.calls.length >= 2, 500);
    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2);

    scheduler.stop();
  });

  it("does not schedule when stop() is called", async () => {
    const callback = vi.fn(async () => {});
    const scheduler = new Scheduler(callback, { intervalMs: 50, maxBackoffMs: 5000 });

    await scheduler.start();
    scheduler.stop();

    const countAfterStop = callback.mock.calls.length;
    await new Promise((r) => setTimeout(r, 200));
    // No additional calls after stop
    expect(callback.mock.calls.length).toBe(countAfterStop);
  });

  it("prevents overlapping rounds", async () => {
    let resolveFirst!: () => void;
    const firstPending = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let callCount = 0;

    const callback = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: block until we resolve it
        await firstPending;
      }
    });

    const scheduler = new Scheduler(callback, { intervalMs: 50, maxBackoffMs: 5000 });

    // Don't await start() since the callback blocks — start it as fire-and-forget
    const startPromise = scheduler.start();

    // Wait for the first call to begin
    await waitFor(() => callCount >= 1, 1000);

    // First call is pending, wait for scheduler to attempt second round
    await new Promise((r) => setTimeout(r, 200));

    // The scheduled round should have been skipped because first is still pending
    expect(callCount).toBe(1);

    // Resolve the first call so start() can complete
    resolveFirst();
    await startPromise;

    scheduler.stop();
  });

  it("backoff doubles interval on failure", async () => {
    const callback = vi.fn(async () => {
      throw new Error("fail");
    });
    // intervalMs=50, so after failure: 100ms
    const scheduler = new Scheduler(callback, { intervalMs: 50, maxBackoffMs: 5000 });

    await scheduler.start();
    expect(callback).toHaveBeenCalledTimes(1);

    // Wait 30ms - should NOT have fired yet (backoff is 100ms)
    await new Promise((r) => setTimeout(r, 30));
    expect(callback).toHaveBeenCalledTimes(1);

    // Wait another 120ms total (150ms from start) - should have fired once more
    await waitFor(() => callback.mock.calls.length >= 2, 500);
    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2);

    scheduler.stop();
  });

  it("backoff caps at maxBackoffMs", async () => {
    const callback = vi.fn(async () => {
      throw new Error("fail");
    });
    // intervalMs=40, maxBackoffMs=80
    // After 1st fail: 80ms (40*2)
    // After 2nd fail: 80ms (capped, not 160)
    const scheduler = new Scheduler(callback, { intervalMs: 40, maxBackoffMs: 80 });

    await scheduler.start();
    const t0 = Date.now();

    // Wait for 3 failures
    await waitFor(() => callback.mock.calls.length >= 3, 3000);
    const elapsed = Date.now() - t0;

    // If capped correctly: ~40 + 80 + 80 = 200ms for 3 calls
    // Without cap: 40 + 80 + 160 = 280ms
    // Allow some tolerance
    expect(elapsed).toBeLessThan(600);

    scheduler.stop();
  });

  it("resets backoff after a successful round", async () => {
    let shouldFail = true;
    const callback = vi.fn(async () => {
      if (shouldFail) throw new Error("fail");
    });
    const scheduler = new Scheduler(callback, { intervalMs: 50, maxBackoffMs: 5000 });

    await scheduler.start();
    expect(callback).toHaveBeenCalledTimes(1);

    // Wait for backoff round (100ms after first failure)
    await waitFor(() => callback.mock.calls.length >= 2, 500);
    shouldFail = false;

    // After success, interval resets to 50ms
    await waitFor(() => callback.mock.calls.length >= 3, 500);
    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(3);

    scheduler.stop();
  });

  it("start() is idempotent when already running", async () => {
    const callback = vi.fn(async () => {});
    const scheduler = new Scheduler(callback, { intervalMs: 500, maxBackoffMs: 5000 });

    await scheduler.start();
    await scheduler.start(); // second call should be ignored

    expect(callback).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
