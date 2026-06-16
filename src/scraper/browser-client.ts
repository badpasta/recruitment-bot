import { createLogger } from "../utils/logger.js";

const log = createLogger("webbridge");

export interface BrowserClient {
  navigate(url: string): Promise<void>;
  getPageContent(): Promise<string>;
  evaluate<T>(code: string): Promise<T>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Browser client that communicates with kimi-webbridge daemon via HTTP API.
 * Daemon endpoint: http://127.0.0.1:10086/command
 */
export class KimiWebBridgeClient implements BrowserClient {
  private baseUrl: string;
  private session: string;

  constructor(baseUrl: string = "http://127.0.0.1:10086/command", session: string = "recruitment") {
    this.baseUrl = baseUrl;
    this.session = session;
  }

  async navigate(url: string): Promise<void> {
    log.info(`Navigating to ${url}`);
    await this.call("navigate", { url, newTab: true });
  }

  async getPageContent(): Promise<string> {
    const result = await this.call("snapshot", {});
    return result.tree ?? "";
  }

  async evaluate<T>(code: string): Promise<T> {
    const result = await this.call("evaluate", { code });
    return result.value as T;
  }

  async click(selector: string): Promise<void> {
    await this.call("click", { selector });
  }

  async type(selector: string, text: string): Promise<void> {
    await this.call("type", { selector, text });
  }

  async disconnect(): Promise<void> {
    try {
      await this.call("close_session", {});
      log.info("Session closed");
    } catch (err) {
      log.warn(`Failed to close session: ${err}`);
    }
  }

  private async call(action: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args, session: this.session }),
    });
    if (!res.ok) {
      throw new Error(`kimi-webbridge error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }
}
