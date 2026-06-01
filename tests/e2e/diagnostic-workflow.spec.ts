import { test, expect } from "@playwright/test";

const TEST_URL = "https://example.com";

/**
 * End-to-end test suite for the cross-border diagnostic platform.
 * Covers: session creation → workspace load → page analysis → module results → report generation
 */

test.describe("Diagnostic Platform E2E", () => {
  test("Home page loads and form validates correctly", async ({ page }) => {
    await page.goto("/");

    // Verify page title and key elements
    await expect(page.locator("h1")).toContainText("跨境出海诊断平台");
    await expect(page.locator("input[type='text']")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toContainText("开始诊断");

    // Test validation: empty URL
    await page.locator("button[type='submit']").click();
    await expect(page.locator("text=请输入网站 URL")).toBeVisible();

    // Test validation: empty market
    await page.locator("input[type='text']").fill("example.com");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("text=请选择目标市场")).toBeVisible();

    // Test validation: invalid URL
    await page.locator("select").selectOption("us");
    await page.locator("input[type='text']").fill("not-a-valid-url");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("text=URL 格式不正确")).toBeVisible();
  });

  test("Create session and navigate to workspace", async ({ page }) => {
    await page.goto("/");

    // Fill form and submit
    await page.locator("input[type='text']").fill(TEST_URL);
    await page.locator("select").selectOption("us");

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/diagnostic/session") && resp.status() === 201
    );
    await page.locator("button[type='submit']").click();

    const response = await responsePromise;
    const session = await response.json();
    expect(session.id).toBeDefined();
    expect(session.url).toBe(TEST_URL);
    expect(session.targetMarket).toBe("us");

    // Should navigate to workspace
    await expect(page).toHaveURL(/\/diagnostic\/.+/);
    await expect(page.locator("text=跨境出海诊断平台")).toBeVisible();
    await expect(page.locator("text=诊断面板")).toBeVisible();
  });

  test("Workspace loads session data and shows preview area", async ({ page }) => {
    // Create session via API
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "eu" },
    });
    expect(sessionRes.status()).toBe(201);
    const session = await sessionRes.json();

    // Navigate to workspace
    await page.goto(`/diagnostic/${session.id}`);

    // Wait for session to load
    await expect(page.locator("text=诊断面板")).toBeVisible();

    // Verify header shows session info
    await expect(page.locator(`text=${TEST_URL}`)).toBeVisible();
    await expect(page.locator("text=eu")).toBeVisible();

    // Preview area should show loading or iframe/screenshot
    await expect(page.locator("text=example.com").first()).toBeVisible();
  });

  test("Analyze page creates page record and initializes module results", async ({ page }) => {
    // Create session
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "jp" },
    });
    const session = await sessionRes.json();

    await page.goto(`/diagnostic/${session.id}`);
    await expect(page.locator("text=诊断面板")).toBeVisible();

    // Click analyze button
    const analyzePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/diagnostic/analyze") && resp.status() === 201
    );
    await page.locator("button:has-text('分析当前页面')").click();
    const analyzeRes = await analyzePromise;
    const pageData = await analyzeRes.json();

    expect(pageData.id).toBeDefined();
    expect(pageData.url).toBe(TEST_URL);
    expect(pageData.results).toHaveLength(4);

    // Verify all 4 modules are initialized
    const modules = pageData.results.map((r: any) => r.module);
    expect(modules).toContain("global_acceleration");
    expect(modules).toContain("lead_page_check");
    expect(modules).toContain("product_content_audit");
    expect(modules).toContain("form_tracking");
  });

  test("Module results eventually complete after analysis", async ({ page }) => {
    // Create session
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "kr" },
    });
    const session = await sessionRes.json();

    await page.goto(`/diagnostic/${session.id}`);

    // Trigger analysis
    await page.locator("button:has-text('分析当前页面')").click();

    // Wait for at least one module to show "completed" status
    // Modules run asynchronously, so we poll the session endpoint
    let completedCount = 0;
    let attempts = 0;
    while (completedCount === 0 && attempts < 30) {
      await page.waitForTimeout(2000);
      const sessionDataRes = await page.request.get(`/api/diagnostic/session/${session.id}`);
      const sessionData = await sessionDataRes.json();
      completedCount = sessionData.pages.flatMap((p: any) => p.results).filter((r: any) => r.status === "completed").length;
      attempts++;
    }

    expect(completedCount).toBeGreaterThan(0);

    // Reload page to see updated UI
    await page.reload();
    await expect(page.locator("text=诊断面板")).toBeVisible();

    // At least one module should show completed status in UI
    const completedBadge = page.locator("text=已完成").first();
    await expect(completedBadge).toBeVisible({ timeout: 5000 });
  });

  test("Generate HTML report and verify download URL", async ({ page }) => {
    // Create session and analyze
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "sea" },
    });
    const session = await sessionRes.json();

    // Trigger analysis via API for speed
    const analyzeRes = await page.request.post("/api/diagnostic/analyze", {
      data: { url: TEST_URL, sessionId: session.id },
    });
    expect(analyzeRes.status()).toBe(201);

    // Wait a bit for async analysis to progress
    await page.waitForTimeout(3000);

    // Generate HTML report
    const reportRes = await page.request.post("/api/diagnostic/report", {
      data: { sessionId: session.id, format: "html" },
    });
    expect(reportRes.status()).toBe(200);
    const report = await reportRes.json();

    expect(report.format).toBe("html");
    expect(report.downloadUrl).toMatch(/\/reports\/report-.+\.html/);

    // Verify report file is accessible
    const fileRes = await page.request.get(report.downloadUrl);
    expect(fileRes.status()).toBe(200);
    const html = await fileRes.text();
    expect(html).toContain("跨境出海诊断报告");
    expect(html).toContain(TEST_URL);
  });

  test("Generate Markdown report and verify content", async ({ page }) => {
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "au" },
    });
    const session = await sessionRes.json();

    await page.request.post("/api/diagnostic/analyze", {
      data: { url: TEST_URL, sessionId: session.id },
    });
    await page.waitForTimeout(3000);

    const reportRes = await page.request.post("/api/diagnostic/report", {
      data: { sessionId: session.id, format: "markdown" },
    });
    expect(reportRes.status()).toBe(200);
    const report = await reportRes.json();

    expect(report.format).toBe("markdown");
    expect(report.downloadUrl).toMatch(/\/reports\/report-.+\.md/);

    const fileRes = await page.request.get(report.downloadUrl);
    expect(fileRes.status()).toBe(200);
    const md = await fileRes.text();
    expect(md).toContain("# 跨境出海诊断报告");
    expect(md).toContain(TEST_URL);
  });

  test("Generate PDF report", async ({ page }) => {
    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "ca" },
    });
    const session = await sessionRes.json();

    await page.request.post("/api/diagnostic/analyze", {
      data: { url: TEST_URL, sessionId: session.id },
    });
    await page.waitForTimeout(3000);

    const reportRes = await page.request.post("/api/diagnostic/report", {
      data: { sessionId: session.id, format: "pdf" },
    });
    expect(reportRes.status()).toBe(200);
    const report = await reportRes.json();

    expect(report.format).toBe("pdf");
    expect(report.downloadUrl).toMatch(/\/reports\/report-.+\.pdf/);

    // Verify PDF is accessible (binary content)
    const fileRes = await page.request.get(report.downloadUrl);
    expect(fileRes.status()).toBe(200);
    const contentType = fileRes.headers()["content-type"];
    expect(contentType).toContain("application/pdf");
  });

  test("Screenshot endpoint returns valid screenshot", async ({ page }) => {
    const res = await page.request.post("/api/diagnostic/screenshot", {
      data: { url: TEST_URL },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.screenshotUrl).toMatch(/\/screenshots\/.+\.png/);
    expect(data.title).toBeDefined();

    // Verify image is accessible
    const imgRes = await page.request.get(data.screenshotUrl);
    expect(imgRes.status()).toBe(200);
    const contentType = imgRes.headers()["content-type"];
    expect(contentType).toContain("image/png");
  });

  test("Proxy endpoint rewrites and returns HTML", async ({ page }) => {
    const res = await page.request.get(`/api/diagnostic/proxy?url=${encodeURIComponent(TEST_URL)}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain("<html");
    // Should have injected navigation tracker script
    expect(html).toContain("diagnostic-navigate");
    // Should have removed CSP meta tags
    expect(html).not.toContain('http-equiv="Content-Security-Policy"');
  });

  test("Session API returns 404 for non-existent session", async ({ page }) => {
    const res = await page.request.get("/api/diagnostic/session/non-existent-id");
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("session not found");
  });

  test("Mobile warning shown on small viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const sessionRes = await page.request.post("/api/diagnostic/session", {
      data: { url: TEST_URL, targetMarket: "br" },
    });
    const session = await sessionRes.json();

    await page.goto(`/diagnostic/${session.id}`);
    await expect(page.locator("text=请在桌面端使用")).toBeVisible();
  });
});
