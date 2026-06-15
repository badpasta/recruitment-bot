import type { BrowserClient } from "../scraper/browser-client.js";
import type { PlatformMessenger } from "../types/index.js";
import { createLogger } from "../utils/logger.js";
import { randomDelay } from "../utils/anti-detect.js";

const log = createLogger("boss-messenger");

/**
 * Sends messages on Boss直聘 via kimi-webbridge browser automation.
 * Finds the candidate's chat in the chat list and sends a message.
 */
export class BossMessenger implements PlatformMessenger {
  constructor(
    private browser: BrowserClient,
    private chatUrl: string,
  ) {}

  async sendMessage(candidateId: string, candidateName: string, message: string): Promise<boolean> {
    try {
      // Navigate to chat page
      await this.browser.navigate(this.chatUrl);
      await randomDelay(1000, 2000);

      // Find the candidate's chat item by name
      const findResult = await this.browser.evaluate<{ found: boolean }>(`
        (function() {
          const chatItems = document.querySelectorAll('.geek-item, .chat-item, [class*="geek"]');
          for (const item of chatItems) {
            const text = item.textContent || '';
            if (text.includes('${candidateName.replace(/'/g, "\\'")}')) {
              return { found: true, index: Array.from(chatItems).indexOf(item) };
            }
          }
          return { found: false };
        })()
      `);

      if (!findResult.found) {
        log.warn(`Cannot find chat for candidate: ${candidateName}`);
        return false;
      }

      // Click the chat item
      await this.browser.evaluate(`
        (function() {
          const chatItems = document.querySelectorAll('.geek-item, .chat-item, [class*="geek"]');
          for (const item of chatItems) {
            if ((item.textContent || '').includes('${candidateName.replace(/'/g, "\\'")}')) {
              item.click();
              return 'clicked';
            }
          }
        })()
      `);
      await randomDelay(500, 1000);

      // Type message in the input field
      await this.browser.evaluate(`
        (function() {
          const input = document.querySelector('.chat-input textarea, .chat-editor textarea, [class*="chat-input"] textarea, [contenteditable="true"]');
          if (!input) return 'no-input';
          input.focus();
          input.value = '${message.replace(/'/g, "\\'")}';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return 'typed';
        })()
      `);
      await randomDelay(300, 800);

      // Send message (simulate Enter or click send button)
      const sendResult = await this.browser.evaluate<{ success: boolean }>(`
        (function() {
          // Try clicking send button
          const sendBtn = document.querySelector('.btn-send, .chat-send, [class*="send-btn"], button[class*="send"]');
          if (sendBtn) {
            sendBtn.click();
            return { success: true };
          }
          // Try pressing Enter
          const input = document.querySelector('.chat-input textarea, .chat-editor textarea, [contenteditable="true"]');
          if (input) {
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
            input.dispatchEvent(enterEvent);
            return { success: true };
          }
          return { success: false };
        })()
      `);

      if (sendResult.success) {
        log.info(`Sent elimination message to ${candidateName}`);
      } else {
        log.warn(`Failed to send message to ${candidateName}: send button not found`);
      }

      return sendResult.success;
    } catch (err) {
      log.error(`Failed to send message to ${candidateName}: ${err}`);
      return false;
    }
  }
}
