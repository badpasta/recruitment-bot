import { describe, it, expect, vi, beforeEach } from "vitest";
import { Eliminator } from "../../src/eliminator/index.js";
import type {
  EliminatorDeps,
  EliminateRequest,
} from "../../src/eliminator/index.js";
import type { BrowserClient } from "../../src/scraper/browser-client.js";

function makeMockDeps(overrides?: Partial<EliminatorDeps>): EliminatorDeps {
  return {
    eliminationStore: {
      isEliminated: vi.fn().mockReturnValue(false),
      insert: vi.fn().mockReturnValue(1),
    } as any,
    resultStore: {
      updateStatus: vi.fn(),
    } as any,
    templateLoader: {
      pickRandom: vi.fn().mockReturnValue("感谢您的关注..."),
    } as any,
    browser: {
      navigate: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      getPageContent: vi.fn(),
      evaluate: vi.fn(),
      disconnect: vi.fn(),
    } as any,
    ...overrides,
  };
}

const sampleReq: EliminateRequest = {
  candidateId: "cand-001",
  positionName: "前端开发",
  reason: "经验不足",
};

describe("Eliminator", () => {
  describe("eliminate", () => {
    it("skips when candidate is already eliminated (idempotency)", async () => {
      const deps = makeMockDeps({
        eliminationStore: {
          isEliminated: vi.fn().mockReturnValue(true),
          insert: vi.fn(),
        } as any,
      });

      const eliminator = new Eliminator(deps);
      const result = await eliminator.eliminate(sampleReq);

      expect(result.skipped).toBe(true);
      expect(deps.eliminationStore.isEliminated).toHaveBeenCalledWith("cand-001");
      // Must not proceed past the idempotency check
      expect(deps.resultStore.updateStatus).not.toHaveBeenCalled();
      expect(deps.templateLoader.pickRandom).not.toHaveBeenCalled();
      expect(deps.browser.navigate).not.toHaveBeenCalled();
      expect(deps.eliminationStore.insert).not.toHaveBeenCalled();
    });

    it("executes the full normal flow in correct order", async () => {
      const deps = makeMockDeps();
      const eliminator = new Eliminator(deps);

      const result = await eliminator.eliminate(sampleReq);

      // Verify result shape
      expect(result.skipped).toBe(false);
      expect(result.platformReplied).toBe(true);
      expect(result.templateUsed).toBe("感谢您的关注...");

      // Verify call order via mock invocation sequence
      const calls = [
        deps.eliminationStore.isEliminated,
        deps.resultStore.updateStatus,
        deps.templateLoader.pickRandom,
        deps.browser.navigate,
        deps.browser.type,
        deps.browser.click,
        deps.eliminationStore.insert,
      ];

      // Each mock must have been called
      expect(deps.eliminationStore.isEliminated).toHaveBeenCalledWith("cand-001");
      expect(deps.resultStore.updateStatus).toHaveBeenCalledWith(
        "cand-001",
        "前端开发",
        "eliminated",
      );
      expect(deps.templateLoader.pickRandom).toHaveBeenCalled();
      expect(deps.browser.navigate).toHaveBeenCalled();
      expect(deps.browser.type).toHaveBeenCalled();
      expect(deps.browser.click).toHaveBeenCalled();
      expect(deps.eliminationStore.insert).toHaveBeenCalled();
    });

    it("reports platformReplied=false when browser operations fail", async () => {
      const deps = makeMockDeps({
        browser: {
          navigate: vi.fn().mockRejectedValue(new Error("Chat page unreachable")),
          type: vi.fn(),
          click: vi.fn(),
          getPageContent: vi.fn(),
          evaluate: vi.fn(),
          disconnect: vi.fn(),
        } as any,
      });

      const eliminator = new Eliminator(deps);
      const result = await eliminator.eliminate(sampleReq);

      expect(result.skipped).toBe(false);
      expect(result.platformReplied).toBe(false);
      // Elimination log should still be recorded
      expect(deps.eliminationStore.insert).toHaveBeenCalled();
    });

    it("records correct log fields in insert", async () => {
      const insertSpy = vi.fn().mockReturnValue(1);
      const deps = makeMockDeps({
        eliminationStore: {
          isEliminated: vi.fn().mockReturnValue(false),
          insert: insertSpy,
        } as any,
      });

      const eliminator = new Eliminator(deps);
      await eliminator.eliminate(sampleReq);

      expect(insertSpy).toHaveBeenCalledTimes(1);
      const record = insertSpy.mock.calls[0][0];
      expect(record.candidateId).toBe("cand-001");
      expect(record.positionName).toBe("前端开发");
      expect(record.reason).toBe("经验不足");
      expect(record.templateUsed).toBe("感谢您的关注...");
      expect(record.platformReplied).toBe(true);
    });

    it("allows reason to be undefined", async () => {
      const insertSpy = vi.fn().mockReturnValue(1);
      const deps = makeMockDeps({
        eliminationStore: {
          isEliminated: vi.fn().mockReturnValue(false),
          insert: insertSpy,
        } as any,
      });

      const eliminator = new Eliminator(deps);
      const req: EliminateRequest = {
        candidateId: "cand-002",
        positionName: "后端开发",
      };
      await eliminator.eliminate(req);

      const record = insertSpy.mock.calls[0][0];
      expect(record.reason).toBeUndefined();
    });

    it("records platformReplied=false in the log when browser fails", async () => {
      const insertSpy = vi.fn().mockReturnValue(1);
      const deps = makeMockDeps({
        browser: {
          navigate: vi.fn().mockRejectedValue(new Error("fail")),
          type: vi.fn(),
          click: vi.fn(),
          getPageContent: vi.fn(),
          evaluate: vi.fn(),
          disconnect: vi.fn(),
        } as any,
        eliminationStore: {
          isEliminated: vi.fn().mockReturnValue(false),
          insert: insertSpy,
        } as any,
      });

      const eliminator = new Eliminator(deps);
      await eliminator.eliminate(sampleReq);

      const record = insertSpy.mock.calls[0][0];
      expect(record.platformReplied).toBe(false);
    });
  });
});
