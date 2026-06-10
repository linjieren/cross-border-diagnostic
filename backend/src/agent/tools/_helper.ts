import { chromium, Page } from "playwright";

export async function withPage<T>(url: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60000);
  try {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      } catch {
        // Some sites keep connections open or delay lifecycle events. Once the
        // main document is committed and the body exists, we can still inspect it.
        await page.goto(url, { waitUntil: "commit", timeout: 30000 });
        await page.waitForSelector("body", { timeout: 15000 });
      }
    }
    return await fn(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

export interface ToolFinding {
  check: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  evidence?: string;
}

export interface ToolResult {
  module: string;
  findings: ToolFinding[];
}
