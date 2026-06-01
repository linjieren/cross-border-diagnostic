import { chromium, Page } from "playwright";

export async function withPage<T>(url: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    return await fn(page);
  } finally {
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
