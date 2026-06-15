import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { StrategySuggestionStore } from "../../src/store/strategy-suggestions.js";

describe("StrategySuggestionStore", () => {
  let db: Database.Database;
  let store: StrategySuggestionStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new StrategySuggestionStore(db);
  });

  afterEach(() => { db.close(); });

  it("inserts a suggestion", () => {
    const id = store.insert({
      content: "建议增加技术面试环节",
      status: "pending",
      relatedFeedbackIds: [1, 2, 3],
      priority: 5,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("gets suggestions filtered by status", () => {
    store.insert({ content: "建议A", status: "pending", relatedFeedbackIds: [1], priority: 5 });
    store.insert({ content: "建议B", status: "accepted", relatedFeedbackIds: [2], priority: 3 });
    store.insert({ content: "建议C", status: "pending", relatedFeedbackIds: [3], priority: 1 });

    const pending = store.getByStatus("pending");
    expect(pending).toHaveLength(2);
    expect(pending[0].priority).toBe(5); // highest priority first
    expect(pending[1].priority).toBe(1);

    expect(store.getByStatus("accepted")).toHaveLength(1);
    expect(store.getByStatus("rejected")).toHaveLength(0);
  });

  it("updates suggestion status", () => {
    const id = store.insert({
      content: "建议D", status: "pending", relatedFeedbackIds: [], priority: 3,
    });
    store.updateStatus(id, "accepted");
    const pending = store.getByStatus("pending");
    expect(pending).toHaveLength(0);
    const accepted = store.getByStatus("accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].id).toBe(id);
  });

  it("gets all suggestions ordered by priority descending", () => {
    store.insert({ content: "低优先", status: "pending", relatedFeedbackIds: [], priority: 1 });
    store.insert({ content: "高优先", status: "pending", relatedFeedbackIds: [], priority: 10 });
    store.insert({ content: "中优先", status: "accepted", relatedFeedbackIds: [], priority: 5 });

    const all = store.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].priority).toBe(10);
    expect(all[1].priority).toBe(5);
    expect(all[2].priority).toBe(1);
  });

  it("preserves related feedback IDs through round-trip", () => {
    store.insert({
      content: "基于多份反馈的总结建议",
      status: "pending",
      relatedFeedbackIds: [10, 20, 30],
      priority: 7,
    });
    const all = store.getAll();
    expect(all[0].relatedFeedbackIds).toEqual([10, 20, 30]);
  });

  it("handles empty related feedback IDs", () => {
    store.insert({
      content: "通用建议", status: "pending", relatedFeedbackIds: [], priority: 1,
    });
    const all = store.getAll();
    expect(all[0].relatedFeedbackIds).toEqual([]);
  });
});
