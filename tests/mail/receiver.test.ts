import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockLogout, mockFetch, mockSearch, mockSimpleParser } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockLogout: vi.fn().mockResolvedValue(undefined),
  mockFetch: vi.fn(),
  mockSearch: vi.fn(),
  mockSimpleParser: vi.fn(),
}));

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    logout: mockLogout,
    fetch: mockFetch,
    search: mockSearch,
  })),
}));

vi.mock("mailparser", () => ({
  simpleParser: mockSimpleParser,
}));

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { EmailReceiver } from "../../src/mail/receiver.js";
import type { ImapConfig } from "../../src/mail/types.js";

const config: ImapConfig = { host: "imap.test.com", port: 993, user: "user", pass: "pass", tls: true };

beforeEach(() => {
  vi.clearAllMocks();
});

function makeFetchedMessage(uid: number, source: string) {
  return { uid, source, seq: uid, envelope: {}, internalDate: new Date() };
}

describe("EmailReceiver", () => {
  describe("constructor", () => {
    it("creates an ImapFlow client with the given IMAP config", () => {
      new EmailReceiver(config);
      expect(ImapFlow).toHaveBeenCalledWith({
        host: "imap.test.com",
        port: 993,
        secure: true,
        auth: { user: "user", pass: "pass" },
      });
    });

    it("defaults secure to false when tls is not set", () => {
      new EmailReceiver({ host: "h", port: 143, user: "u", pass: "p" });
      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe("connect", () => {
    it("calls client.connect", async () => {
      const receiver = new EmailReceiver(config);
      await receiver.connect();
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("calls client.logout", async () => {
      const receiver = new EmailReceiver(config);
      await receiver.disconnect();
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("fetchLatest", () => {
    it("searches then fetches the latest messages", async () => {
      mockSearch.mockResolvedValue([1, 2, 3, 4, 5, 6, 7]);

      const rawMsg = makeFetchedMessage(7, "raw email source");
      mockFetch.mockReturnValue((async function* () {
        yield rawMsg;
      })());

      mockSimpleParser.mockResolvedValue({
        messageId: "<id@test>",
        from: { text: "a@b.com" },
        to: { text: "c@d.com" },
        subject: "Hello",
        date: new Date("2026-06-16T00:00:00Z"),
        text: "plain",
        html: "<p>html</p>",
        attachments: [],
      });

      const receiver = new EmailReceiver(config);
      const result = await receiver.fetchLatest(5);

      expect(mockSearch).toHaveBeenCalledWith({ all: true });
      expect(mockFetch).toHaveBeenCalledWith(
        [3, 4, 5, 6, 7],
        { source: true, uid: true, envelope: true, internalDate: true },
      );
      expect(simpleParser).toHaveBeenCalledWith("raw email source");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        messageId: "<id@test>",
        from: "a@b.com",
        to: ["c@d.com"],
        subject: "Hello",
        date: new Date("2026-06-16T00:00:00Z"),
        text: "plain",
        html: "<p>html</p>",
        attachments: [],
      });
    });

    it("handles empty mailbox", async () => {
      mockSearch.mockResolvedValue([]);

      const receiver = new EmailReceiver(config);
      const result = await receiver.fetchLatest(3);

      expect(result).toEqual([]);
    });

    it("fetches all available when fewer than count exist", async () => {
      mockSearch.mockResolvedValue([1, 2]);

      mockFetch.mockReturnValue((async function* () {})());

      const receiver = new EmailReceiver(config);
      await receiver.fetchLatest(5);

      expect(mockFetch).toHaveBeenCalledWith(
        [1, 2],
        { source: true, uid: true, envelope: true, internalDate: true },
      );
    });

    it("defaults to 10 messages", async () => {
      const seqs = Array.from({ length: 20 }, (_, i) => i + 1);
      mockSearch.mockResolvedValue(seqs);
      mockFetch.mockReturnValue((async function* () {})());

      const receiver = new EmailReceiver(config);
      await receiver.fetchLatest();

      expect(mockFetch).toHaveBeenCalledWith(
        seqs.slice(-10),
        expect.any(Object),
      );
    });
  });

  describe("fetchSince", () => {
    it("fetches messages since a given date", async () => {
      mockFetch.mockReturnValue((async function* () {})());

      const receiver = new EmailReceiver(config);
      const since = new Date("2026-06-15T00:00:00Z");
      await receiver.fetchSince(since);

      expect(mockFetch).toHaveBeenCalledWith(
        { since },
        { source: true, uid: true, envelope: true, internalDate: true },
      );
    });

    it("parses fetched messages", async () => {
      const rawMsg = makeFetchedMessage(1, "source");
      mockFetch.mockReturnValue((async function* () {
        yield rawMsg;
      })());

      mockSimpleParser.mockResolvedValue({
        messageId: "<x>",
        from: { text: "x@y.com" },
        to: { text: "z@y.com" },
        subject: "Test",
        date: new Date("2026-06-16T00:00:00Z"),
        attachments: [],
      });

      const receiver = new EmailReceiver(config);
      const result = await receiver.fetchSince(new Date("2026-06-15"));

      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe("Test");
    });
  });
});
