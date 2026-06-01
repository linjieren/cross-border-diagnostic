import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { chromium } from "playwright";
import MarkdownIt from "markdown-it";
import { analyzeGlobalAcceleration } from "../lib/modules/global-acceleration";
import { analyzeLeadPage } from "../lib/modules/lead-page-check";
import { analyzeProductContent } from "../lib/modules/product-content-audit";
import { analyzeFormTracking } from "../lib/modules/form-tracking";
import { crawlSite } from "../lib/modules/crawler";
import * as fs from "fs";
import * as path from "path";

export const diagnosticRouter = Router();
const md = new MarkdownIt();

// ---- 辅助函数 ----

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- 进度追踪 ----

interface ScanProgress {
  status: "idle" | "crawling" | "analyzing" | "completed" | "failed";
  discovered: number;
  analyzed: number;
  total: number;
  currentPage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  error?: string;
}

const scanProgressStore = new Map<string, ScanProgress>();

// ---- Crawler + 分析辅助 ----

async function runModulesOnPage(
  pageId: string,
  url: string,
  browserPage: any,
  targetMarket: string
): Promise<void> {
  await analyzeGlobalAcceleration(pageId, url, browserPage, targetMarket).catch(
    (e) => console.error("MOD-001 analysis failed:", e)
  );
  await analyzeLeadPage(pageId, url, browserPage).catch(
    (e) => console.error("MOD-002 analysis failed:", e)
  );
  await analyzeProductContent(pageId, url, browserPage).catch(
    (e) => console.error("MOD-003 analysis failed:", e)
  );
  await analyzeFormTracking(pageId, url, browserPage).catch(
    (e) => console.error("MOD-004 analysis failed:", e)
  );
}

async function performSiteScan(sessionId: string, startUrl: string, targetMarket: string): Promise<void> {
  const progress: ScanProgress = {
    status: "crawling",
    discovered: 0,
    analyzed: 0,
    total: 0,
    currentPage: null,
    startedAt: new Date(),
    completedAt: null,
  };
  scanProgressStore.set(sessionId, progress);

  let browser: any;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    const crawled = await crawlSite(page, startUrl, 20, 3);
    progress.discovered = crawled.length;
    progress.total = crawled.length;
    progress.status = "analyzing";

    for (const cp of crawled) {
      const existing = await prisma.diagnosticPage.findFirst({
        where: { sessionId, url: cp.url },
      });
      if (existing) continue;

      const pageId = generateId("dpg");
      await prisma.diagnosticPage.create({
        data: {
          id: pageId,
          sessionId,
          url: cp.url,
          title: cp.title,
          pageType: cp.pageType,
          depth: cp.depth,
          weight: cp.weight,
          status: "analyzing",
        },
      });

      const modules = ["global_acceleration", "lead_page_check", "product_content_audit", "form_tracking"];
      await prisma.diagnosticResult.createMany({
        data: modules.map((module) => ({
          id: generateId("dre"),
          pageId,
          module,
          status: "pending",
        })),
      });
    }

    const dbPages = await prisma.diagnosticPage.findMany({
      where: { sessionId },
      orderBy: { weight: "desc" },
    });

    for (const dbPage of dbPages) {
      progress.currentPage = dbPage.url;
      try {
        try {
          await page.goto(dbPage.url, { waitUntil: "networkidle", timeout: 60000 });
        } catch {
          await page.goto(dbPage.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        const title = await page.title().catch(() => dbPage.title || "");
        if (title && !dbPage.title) {
          await prisma.diagnosticPage.update({
            where: { id: dbPage.id },
            data: { title },
          });
        }

        await runModulesOnPage(dbPage.id, dbPage.url, page, targetMarket);

        await prisma.diagnosticPage.update({
          where: { id: dbPage.id },
          data: { status: "completed" },
        });

        progress.analyzed += 1;
      } catch (e) {
        console.error(`page analysis failed: ${dbPage.url}`, e);
        await prisma.diagnosticPage.update({
          where: { id: dbPage.id },
          data: { status: "failed" },
        });
      }
    }

    progress.status = "completed";
    progress.completedAt = new Date();
    progress.currentPage = null;

    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { status: "completed" },
    });
  } catch (e) {
    progress.status = "failed";
    progress.error = (e as Error).message;
    console.error("site scan failed:", e);
    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { status: "failed" },
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---- 创建诊断会话 ----

diagnosticRouter.post("/session", async (req: Request, res: Response) => {
  try {
    const { url, targetMarket } = req.body as { url: string; targetMarket: string };
    if (!url || !targetMarket) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.urlAndMarketRequired") ?? "url and targetMarket are required" });
      return;
    }

    const normalized = normalizeUrl(url);
    const sessionId = generateId("dsn");
    const userId = (req as any).user?.id || undefined;

    const session = await prisma.diagnosticSession.create({
      data: {
        id: sessionId,
        url: normalized,
        targetMarket,
        status: "in_progress",
        userId,
      },
    });

    // 自动触发全站扫描
    performSiteScan(sessionId, normalized, targetMarket).catch((e) => {
      console.error("auto site scan failed:", e);
    });

    res.status(201).json(session);
  } catch (err) {
    console.error("create session error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 获取会话详情 ----

diagnosticRouter.get("/session/:id", async (req: Request, res: Response) => {
  try {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: req.params.id as string },
      include: {
        pages: {
          include: { results: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    res.json(session);
  } catch (err) {
    console.error("get session error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 获取扫描进度 ----

diagnosticRouter.get("/session/:id/progress", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id as string;
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
      include: { pages: { include: { results: true } } },
    });

    if (!session) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    const progress = scanProgressStore.get(sessionId);
    if (progress) {
      res.json({
        sessionId,
        status: progress.status,
        discovered: progress.discovered,
        analyzed: progress.analyzed,
        total: progress.total,
        currentPage: progress.currentPage,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        error: progress.error,
      });
      return;
    }

    const pages = (session as any).pages || [];
    const analyzed = pages.filter((p: any) => p.status === "completed" || p.status === "failed").length;
    const derivedStatus =
      session.status === "in_progress" && analyzed < pages.length
        ? "analyzing"
        : session.status;

    res.json({
      sessionId,
      status: derivedStatus,
      discovered: pages.length,
      analyzed,
      total: pages.length,
      currentPage: null,
      startedAt: session.createdAt,
      completedAt: null,
      error: null,
    });
  } catch (err) {
    console.error("progress error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 手动触发扫描 ----

diagnosticRouter.post("/crawl", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId: string };
    if (!sessionId) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.sessionIdRequired") ?? "sessionId is required" });
      return;
    }

    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    const existing = scanProgressStore.get(sessionId);
    if (existing && existing.status !== "completed" && existing.status !== "failed") {
      res.status(409).json({ error: (req as any).t?.("apiErrors.scanInProgress") ?? "scan already in progress", status: existing.status });
      return;
    }

    performSiteScan(sessionId, session.url, session.targetMarket).catch((e) => {
      console.error("manual crawl failed:", e);
    });

    res.json({ success: true, sessionId, status: "started" });
  } catch (err) {
    console.error("crawl error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 截图服务 ----

diagnosticRouter.post("/screenshot", async (req: Request, res: Response) => {
  let browser;
  try {
    const { url, sessionId, pageId } = req.body as {
      url: string;
      sessionId?: string;
      pageId?: string;
    };
    if (!url) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.urlRequired") ?? "url is required" });
      return;
    }

    const normalized = normalizeUrl(url);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await page.goto(normalized, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const screenshotDir = path.join(process.cwd(), "diagnostic/screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    const screenshotName = `${sessionId || "anon"}_${Date.now()}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const title = await page.title();
    const screenshotUrl = `/screenshots/${screenshotName}`;

    await browser.close();
    browser = undefined;

    // 如有 sessionId，创建/更新页面记录
    let dbPage = null;
    if (sessionId) {
      if (pageId) {
        dbPage = await prisma.diagnosticPage.update({
          where: { id: pageId },
          data: { screenshotUrl, title, status: "completed" },
        });
      } else {
        dbPage = await prisma.diagnosticPage.create({
          data: {
            id: generateId("dpg"),
            sessionId,
            url: normalized,
            title,
            screenshotUrl,
            status: "completed",
          },
        });
      }
    }

    res.json({
      url: normalized,
      title,
      screenshotUrl,
      pageId: dbPage?.id,
    });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("screenshot error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.screenshotFailed") ?? "screenshot failed", message: (err as Error).message });
  }
});

// ---- 代理加载（重写响应头） ----

diagnosticRouter.get("/proxy", async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url;
    const targetUrl = typeof rawUrl === "string" ? rawUrl : Array.isArray(rawUrl) && typeof rawUrl[0] === "string" ? rawUrl[0] : "";
    if (!targetUrl) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.urlRequired") ?? "url is required" });
      return;
    }

    const normalized = normalizeUrl(targetUrl);

    // 防御：禁止代理本地地址，防止嵌套代理和 SSRF
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('127.') || hostname === '0.0.0.0') {
      res.status(400).json({ error: (req as any).t?.("apiErrors.cannotProxyLocal") ?? "cannot proxy local addresses" });
      return;
    }

    const response = await fetch(normalized, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const contentType = response.headers.get("content-type") || "text/html";
    const body = await response.text();

    // 重写 HTML 中的相对路径为绝对路径
    const baseUrl = new URL(normalized);
    let rewritten = body
      .replace(/href="\/([^"]*)/g, `href="${baseUrl.origin}/$1`)
      .replace(/src="\/([^"]*)/g, `src="${baseUrl.origin}/$1`)
      .replace(/url\(\/([^)]*)\)/g, `url(${baseUrl.origin}/$1)`);

    // 移除 X-Frame-Options 和 CSP 相关的 meta 标签
    rewritten = rewritten
      .replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, "")
      .replace(/<meta[^>]*http-equiv="X-Frame-Options"[^>]*>/gi, "");

    // 将所有链接重写到代理
    const proxyPrefix = `/api/diagnostic/proxy?url=`;
    rewritten = rewritten.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match, p1) => `href="${proxyPrefix}${encodeURIComponent(p1)}"`
    );

    // 注入页面导航追踪脚本
    const trackerScript = `
<script>
(function() {
  var reportedUrl = location.href;
  function report() {
    var url = location.href;
    if (url !== reportedUrl) {
      reportedUrl = url;
      window.parent.postMessage({ type: 'diagnostic-navigate', url: url }, '*');
    }
  }
  // 拦截点击
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.href) {
      window.parent.postMessage({ type: 'diagnostic-navigate', url: a.href }, '*');
    }
  });
  // 拦截 history 变化（SPA）
  var originalPushState = history.pushState;
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    setTimeout(report, 0);
  };
  var originalReplaceState = history.replaceState;
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    setTimeout(report, 0);
  };
  window.addEventListener('popstate', report);
})();
</script>`;

    // 将脚本注入到 </head> 或 </body> 前
    if (rewritten.includes("</head>")) {
      rewritten = rewritten.replace("</head>", trackerScript + "</head>");
    } else if (rewritten.includes("</body>")) {
      rewritten = rewritten.replace("</body>", trackerScript + "</body>");
    } else {
      rewritten += trackerScript;
    }

    res.setHeader("Content-Type", contentType);
    res.send(rewritten);
  } catch (err) {
    console.error("proxy error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.proxyFailed") ?? "proxy failed", message: (err as Error).message });
  }
});

// ---- 报告生成 ----

interface ReportModule {
  name: string;
  status: string;
  score?: number;
  findings: any;
}

// ---- Google Brand Palette ----
// Blue #4285F4 | Red #EA4335 | Yellow #FBBC04 | Green #34A853
// Dark Gray #3C4043 | Light Gray #F1F3F4 | Black #000000 | Medium Gray #9AA0A6

function getGrade(score: number | null, t?: any): { label: string; color: string } {
  if (score == null) return { label: t?.("report.gradeNotRated") ?? "未评分", color: "#9AA0A6" };
  if (score >= 80) return { label: t?.("report.gradeExcellent") ?? "优秀", color: "#34A853" };
  if (score >= 60) return { label: t?.("report.gradeGood") ?? "良好", color: "#FBBC04" };
  return { label: t?.("report.gradeNeedsImprovement") ?? "需改进", color: "#EA4335" };
}

function getSeverity(score: number | null, t?: any): { level: string; label: string; color: string } {
  if (score == null) return { level: "none", label: t?.("report.severityNotRated") ?? "未评分", color: "#9AA0A6" };
  if (score < 40) return { level: "critical", label: t?.("report.severityCritical") ?? "严重", color: "#EA4335" };
  if (score < 60) return { level: "high", label: t?.("report.severityHigh") ?? "高", color: "#EA4335" };
  if (score < 80) return { level: "medium", label: t?.("report.severityMedium") ?? "中", color: "#FBBC04" };
  return { level: "low", label: t?.("report.severityLow") ?? "低", color: "#34A853" };
}

function renderScoreRing(score: number | null, size = 120): string {
  const s = score ?? 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (s / 100) * circumference;
  const { color } = getGrade(score);
  return `
    <div class="score-ring" style="width:${size}px;height:${size}px;position:relative;">
      <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="transform:rotate(-90deg);">
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#F1F3F4" stroke-width="8" />
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:22px;font-weight:700;color:${color};font-family:Roboto,'Helvetica Neue',sans-serif;">${score ?? "-"}</span>
        <span style="font-size:11px;color:#9AA0A6;">/100</span>
      </div>
    </div>
  `;
}

function renderPriorityBadge(priority: string, t?: any): string {
  const map: Record<string, { bg: string; color: string; text: string }> = {
    critical: { bg: "#FCE8E6", color: "#EA4335", text: t?.("report.severityCritical") ?? "严重" },
    high: { bg: "#FCE8E6", color: "#EA4335", text: t?.("report.severityHigh") ?? "高优先级" },
    medium: { bg: "#FEF7E0", color: "#B06000", text: t?.("report.severityMedium") ?? "中优先级" },
    low: { bg: "#F1F3F4", color: "#3C4043", text: t?.("report.severityLow") ?? "低优先级" },
  };
  const p = map[priority] || map.low;
  return `<span class="badge" style="display:inline-block;background:${p.bg};color:${p.color};padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.3px;">${p.text}</span>`;
}

function renderSeverityBadge(score: number | null, t?: any): string {
  const sev = getSeverity(score, t);
  return `<span class="severity-badge" style="display:inline-block;background:${sev.color}15;color:${sev.color};padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.3px;border:1px solid ${sev.color}30;">${sev.label}${t?.("report.severitySuffix") ?? "风险"}</span>`;
}

function renderRoiEstimate(module: string, priority: string, t?: any): string {
  const roiMap: Record<string, string> = {
    global_acceleration: t?.("report.roiMapGlobalAcceleration") ?? "预计提升页面加载速度 30-50%，降低跳出率 15-25%",
    lead_page_check: t?.("report.roiMapLeadPage") ?? "预计提升表单提交转化率 20-40%，减少潜在客户流失",
    product_content_audit: t?.("report.roiMapProductContent") ?? "预计提升页面停留时间 25-35%，增强品牌信任度",
    form_tracking: t?.("report.roiMapFormTracking") ?? "预计提升广告投放 ROAS 20-30%，实现精准归因",
  };
  const baseRoi = roiMap[module] || (t?.("report.roiDefault") ?? "预计提升整体运营效率 15-25%");
  const priorityMultiplier = priority === "critical" || priority === "high"
    ? (t?.("report.roiCritical") ?? "（高优先级，建议立即实施）")
    : priority === "medium"
      ? (t?.("report.roiMedium") ?? "（建议 30 天内完成）")
      : (t?.("report.roiLow") ?? "（可在 90 天内规划）");
  return `${baseRoi} ${priorityMultiplier}`;
}

function renderCodeBlock(code: string, lang: string, t?: any): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div class="code-block" style="position:relative;margin:12px 0;">
      <button class="copy-btn" onclick="copyCode(this)" style="position:absolute;top:6px;right:6px;padding:3px 10px;font-size:11px;background:#3C4043;color:#F1F3F4;border:none;border-radius:4px;cursor:pointer;font-family:Roboto,sans-serif;">${t?.("report.copyCode") ?? "复制"}</button>
      <pre style="background:#3C4043;color:#F1F3F4;padding:16px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6;margin:0;font-family:'Roboto Mono',monospace;"><code>${escaped}</code></pre>
    </div>
  `;
}

function getModuleMeta(t?: any): Record<string, { title: string; icon: string; desc: string }> {
  return {
    global_acceleration: { title: t?.("modules.globalAcceleration.title") ?? "全球访问加速", icon: "🚀", desc: t?.("modules.globalAcceleration.description") ?? "CDN 部署、协议优化与缓存策略分析" },
    lead_page_check: { title: t?.("modules.leadPageCheck.title") ?? "留资页面检查", icon: "🛡️", desc: t?.("modules.leadPageCheck.description") ?? "HTTPS、安全护盾、表单结构与转化路径审查" },
    product_content_audit: { title: t?.("modules.productContentAudit.title") ?? "产品内容梳理", icon: "📋", desc: t?.("modules.productContentAudit.description") ?? "合规认证、客户背书、技术参数与内容完整性评估" },
    form_tracking: { title: t?.("modules.formTracking.title") ?? "表单数据追踪", icon: "📊", desc: t?.("modules.formTracking.description") ?? "GA4、Meta Pixel、转化追踪与 UTM 归因检测" },
  };
}

function renderModuleCard(m: any, index: number, t?: any): string {
  const f = m.findings || {};
  const rd = m.reportData || {};
  const { label, color } = getGrade(m.score, t);
  const sev = getSeverity(m.score, t);
  const meta = getModuleMeta(t)[m.module] || { title: m.module, icon: "📦", desc: "" };
  let body = "";

  const sevBanner = {
    critical: t?.("report.severityBannerCritical") ?? "该模块存在严重问题，建议立即优先处理。",
    high: t?.("report.severityBannerHigh") ?? "该模块存在显著改进空间，建议短期内完成优化。",
    medium: t?.("report.severityBannerMedium") ?? "该模块表现良好，仍有细节可进一步提升。",
    low: t?.("report.severityBannerLow") ?? "该模块表现优秀，保持当前策略即可。",
  };
  // Severity banner
  body += `
    <div class="severity-banner" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${sev.color}08;border-left:4px solid ${sev.color};border-radius:0 8px 8px 0;margin-bottom:16px;">
      ${renderSeverityBadge(m.score, t)}
      <span style="font-size:13px;color:#3C4043;">
        ${sevBanner[sev.level as keyof typeof sevBanner] ?? sevBanner.low}
      </span>
    </div>`;

  // Findings grid
  if (m.module === "global_acceleration") {
    const httpInfo = f.httpProtocol || {};
    const imgOpt = f.imageOptimization || {};
    const cache = f.cacheHeaders || {};
    body += `<div class="findings-grid">
      <div class="finding-item"><span class="finding-label">CDN</span><span class="finding-value" style="color:${f.cdn?.detected ? "#34A853" : "#EA4335"};">${f.cdn?.detected ? `已部署 (${f.cdn.provider})` : "未检测到"}</span></div>
      <div class="finding-item"><span class="finding-label">TTFB</span><span class="finding-value">${f.latency?.ttfb ?? "-"} ms</span></div>
      <div class="finding-item"><span class="finding-label">页面加载</span><span class="finding-value">${f.latency?.pageLoadTime ?? "-"} ms</span></div>
      <div class="finding-item"><span class="finding-label">HTTP/2</span><span class="finding-value" style="color:${httpInfo.http2 ? "#34A853" : "#9AA0A6"};">${httpInfo.http2 ? "已启用" : httpInfo.protocol || "-"}</span></div>
      <div class="finding-item"><span class="finding-label">图片优化</span><span class="finding-value" style="color:${imgOpt.optimized ? "#34A853" : "#EA4335"};">${imgOpt.optimized ? "已优化" : "需改进"}</span></div>
      <div class="finding-item"><span class="finding-label">缓存策略</span><span class="finding-value" style="color:${cache.hasCacheHeaders ? "#34A853" : "#EA4335"};">${cache.hasCacheHeaders ? "已配置" : "缺失"}</span></div>
    </div>`;
    if (f.estimatedImprovement) {
      body += `<div class="insight-box"><strong style="color:#4285F4;">💡 影响评估：</strong>${f.estimatedImprovement}</div>`;
    }
  }

  if (m.module === "lead_page_check") {
    const vp = f.viewport || {};
    body += `<div class="findings-grid">
      <div class="finding-item"><span class="finding-label">HTTPS</span><span class="finding-value" style="color:${f.https ? "#34A853" : "#EA4335"};">${f.https ? "已启用" : "未启用"}</span></div>
      <div class="finding-item"><span class="finding-label">安全防护</span><span class="finding-value" style="color:${f.security?.detected ? "#34A853" : "#EA4335"};">${f.security?.detected ? (f.security.type || "已安装") : "未安装"}</span></div>
      <div class="finding-item"><span class="finding-label">表单评分</span><span class="finding-value">${f.forms?.score ?? "-"}/100</span></div>
      <div class="finding-item"><span class="finding-label">表单字段</span><span class="finding-value">${f.forms?.totalFields ?? 0} 个</span></div>
      <div class="finding-item"><span class="finding-label">移动端适配</span><span class="finding-value" style="color:${vp.mobileOptimized ? "#34A853" : "#EA4335"};">${vp.mobileOptimized ? "已优化" : "未配置"}</span></div>
      <div class="finding-item"><span class="finding-label">CTA 文案</span><span class="finding-value">${f.forms?.ctaText || "-"}</span></div>
    </div>`;
    if (f.interceptionRate) {
      body += `<div class="insight-box"><strong style="color:#4285F4;">💡 影响评估：</strong>${f.interceptionRate}</div>`;
    }
  }

  if (m.module === "product_content_audit") {
    const extra = f.extraContent || {};
    const items = [
      { k: "合规认证", v: f.structure?.complianceCerts?.detected },
      { k: "客户背书", v: f.structure?.customerEndorsements?.detected },
      { k: "技术参数", v: f.structure?.technicalParams?.detected },
      { k: "工作原理", v: f.structure?.workingPrinciple?.detected },
      { k: "FAQ", v: extra.faqDetected },
      { k: "定价信息", v: extra.pricingDetected },
      { k: "视频内容", v: extra.videoDetected, suffix: extra.videoCount ? ` (${extra.videoCount} 个)` : "" },
      { k: "社交证明", v: extra.socialProofDetected },
    ];
    body += `<div class="findings-grid">` + items.map((it) =>
      `<div class="finding-item"><span class="finding-label">${it.k}</span><span class="finding-value" style="color:${it.v ? "#34A853" : "#EA4335"};">${it.v ? `已包含${it.suffix || ""}` : "缺失"}</span></div>`
    ).join("") + `</div>`;
  }

  if (m.module === "form_tracking") {
    const adv = f.advancedTracking || {};
    const cookie = f.cookieConsent || {};
    const checks = [
      { k: "GA4 基础追踪", v: f.baseTracking?.ga4?.detected },
      { k: "Meta Pixel", v: f.baseTracking?.metaPixel?.detected },
      { k: "表单转化追踪", v: f.conversionTracking?.ga4Conversion?.detected || f.conversionTracking?.metaLead?.detected },
      { k: "PDF 下载追踪", v: f.downloadTracking?.pdfDownload?.detected },
      { k: "UTM 参数", v: f.utmCheck?.hasUtmParams || f.utmCheck?.formPreservesUtm },
      { k: "Cookie 合规", v: cookie.detected, label: cookie.provider || "未检测" },
      { k: "LinkedIn Insight", v: adv.linkedInInsight?.detected },
      { k: "TikTok Pixel", v: adv.tikTokPixel?.detected },
    ];
    body += `<div class="findings-grid">` + checks.map((c) =>
      `<div class="finding-item"><span class="finding-label">${c.k}</span><span class="finding-value" style="color:${c.v ? "#34A853" : "#EA4335"};">${c.v ? "已部署" : "缺失"}${c.label && !c.v ? ` (${c.label})` : ""}</span></div>`
    ).join("") + `</div>`;
    if (f.trackingCoverage) {
      body += `<div class="insight-box"><strong style="color:#4285F4;">💡 影响评估：</strong>${f.trackingCoverage}</div>`;
    }
  }

  // Evidence / Screenshots
  if (f.screenshots && f.screenshots.length > 0) {
    body += `<div class="evidence-section"><div class="section-title">📷 ${t?.("report.evidenceTitle") ?? "检测证据"}</div><div class="screenshot-grid">`;
    for (const ss of f.screenshots.slice(0, 4)) {
      body += `<div class="screenshot-card"><img src="${ss.url}" alt="${ss.label || (t?.("report.screenshotAlt") ?? "截图")}" style="width:100%;border-radius:6px;border:1px solid #E8EAED;" /><div style="font-size:11px;color:#5F6368;margin-top:4px;">${ss.label || ""}</div></div>`;
    }
    body += `</div></div>`;
  }

  // Recommendations with ROI
  const allRecs: Array<{ text: string; priority: string; module: string }> = [];
  if (rd.recommendations && rd.recommendations.length > 0) {
    for (const rec of rd.recommendations) {
      const priority = rec.includes("紧急") || rec.includes("必须") ? "critical" : rec.includes("建议") ? "medium" : "low";
      allRecs.push({ text: rec, priority, module: m.module });
    }
  } else if (f.missingItems && f.missingItems.length > 0) {
    for (const item of f.missingItems) {
      allRecs.push({ text: `${item.item} — ${item.reason}`, priority: item.priority || "medium", module: m.module });
    }
  }

  if (allRecs.length > 0) {
    body += `<div class="recommendations"><div class="section-title">🎯 ${t?.("report.recommendations") ?? "可执行建议 & ROI 预期"}</div><ul style="list-style:none;padding:0;margin:0;">`;
    for (const rec of allRecs) {
      const roi = renderRoiEstimate(m.module, rec.priority, t);
      body += `<li style="display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:1px solid #F1F3F4;">
        <div style="display:flex;align-items:center;gap:8px;">${renderPriorityBadge(rec.priority, t)} <span class="rec-text" style="font-size:13px;color:#202124;line-height:1.5;">${rec.text}</span></div>
        <div class="roi-text" style="font-size:12px;color:#5F6368;padding-left:76px;">📈 ${roi}</div>
      </li>`;
    }
    body += `</ul></div>`;
  }

  // Deployment code
  if (f.deploymentCode) {
    body += `<div class="deployment-section"><div class="section-title">🔧 ${t?.("report.deploymentCode") ?? "部署代码"}</div>`;
    if (typeof f.deploymentCode === "string") {
      body += renderCodeBlock(f.deploymentCode, "html", t);
    } else {
      for (const [key, code] of Object.entries(f.deploymentCode)) {
        if (code) {
          body += `<div class="code-label" style="font-size:12px;color:#4285F4;font-weight:600;margin-top:12px;margin-bottom:4px;">${key}</div>`;
          body += renderCodeBlock(code as string, "html", t);
        }
      }
    }
    body += `</div>`;
  }

  // Industry templates
  const templates = f.industryTemplates || f.templates || [];
  if (templates.length > 0) {
    body += `<div class="templates-section"><div class="section-title">🏭 ${t?.("report.industryTemplates") ?? "行业参考模板"}</div>`;
    for (const tmpl of templates.slice(0, 4)) {
      const fields = tmpl.fields || tmpl.sections || [];
      body += `<div class="template-card" style="background:#fff;padding:12px 14px;border-radius:8px;font-size:12px;margin:8px 0;border:1px solid #E8EAED;">
        <strong style="color:#202124;">${tmpl.industry}</strong><br/>
        <span style="color:#5F6368;">${fields.join("、")}</span><br/>
        <span style="color:#4285F4;">${tmpl.tips}</span>
      </div>`;
    }
    body += `</div>`;
  }

  const statusLabel = m.status === "completed"
    ? (t?.("report.statusCompleted") ?? "已完成")
    : m.status === "failed"
      ? (t?.("report.statusFailed") ?? "失败")
      : m.status;

  return `
    <section class="module-card" id="module-${m.module}" style="page-break-inside:avoid;">
      <div class="module-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:20px;">${meta.icon}</span>
            <h2 style="font-size:18px;margin:0;color:#202124;font-weight:600;">${meta.title}</h2>
          </div>
          <div style="color:#5F6368;font-size:13px;margin-top:4px;">${meta.desc}</div>
          <div style="color:#5F6368;font-size:12px;margin-top:2px;">${t?.("report.moduleStatus") ?? "状态"}: ${statusLabel} · ${t?.("report.moduleScore") ?? "评分"}: <span style="color:${color};font-weight:600;">${m.score ?? "-"}/100</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${renderSeverityBadge(m.score, t)}
          <div class="grade-badge" style="background:${color}15;color:${color};padding:4px 14px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid ${color}30;">${label}</div>
        </div>
      </div>
      ${body}
    </section>
  `;
}

function generateReportHtml(
  session: any,
  pages: any[],
  format: "html" | "pdf",
  t?: any
): string {
  const modules = pages.flatMap((p) => p.results || []);
  const completedModules = modules.filter((m) => m.status !== "pending");

  // 按页面权重计算综合评分
  let weightedSum = 0;
  let totalWeight = 0;
  for (const page of pages) {
    const pageModules = page.results || [];
    const scored = pageModules.filter((m: any) => m.score != null);
    if (scored.length === 0) continue;
    const pageScore = scored.reduce((a: number, m: any) => a + (m.score ?? 0), 0) / scored.length;
    const weight = page.weight ?? 1;
    weightedSum += pageScore * weight;
    totalWeight += weight;
  }
  const avgScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  const overall = getGrade(avgScore, t);
  const overallSev = getSeverity(avgScore, t);

  const criticalCount = completedModules.filter((m) => (m.score ?? 100) < 40).length;
  const highCount = completedModules.filter((m) => { const s = m.score ?? 100; return s >= 40 && s < 60; }).length;
  const mediumCount = completedModules.filter((m) => { const s = m.score ?? 100; return s >= 60 && s < 80; }).length;
  const lowCount = completedModules.filter((m) => (m.score ?? 0) >= 80).length;

  // Collect all recommendations for roadmap
  const allRecs: Array<{ text: string; priority: string; module: string; score: number | null }> = [];
  for (const m of completedModules) {
    const f = m.findings || {};
    const rd = m.reportData || {};
    if (rd.recommendations && rd.recommendations.length > 0) {
      for (const rec of rd.recommendations) {
        const priority = rec.includes("紧急") || rec.includes("必须") ? "critical" : rec.includes("建议") ? "medium" : "low";
        allRecs.push({ text: rec, priority, module: m.module, score: m.score });
      }
    } else if (f.missingItems && f.missingItems.length > 0) {
      for (const item of f.missingItems) {
        allRecs.push({ text: `${item.item} — ${item.reason}`, priority: item.priority || "medium", module: m.module, score: m.score });
      }
    }
  }

  const day30 = allRecs.filter((r) => r.priority === "critical" || r.priority === "high").slice(0, 6);
  const day60 = allRecs.filter((r) => r.priority === "medium" && !day30.includes(r)).slice(0, 6);
  const day90 = allRecs.filter((r) => !day30.includes(r) && !day60.includes(r)).slice(0, 6);

  const moduleSections = completedModules.map((m, i) => renderModuleCard(m, i, t)).join("");

  const isPdf = format === "pdf";
  const pageBreak = isPdf ? "page-break-after:always;" : "";
  const sectionBreak = isPdf ? "page-break-before:always;" : "margin-top:48px;";

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    body {
      font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6; color: #202124; max-width: 960px; margin: 0 auto;
      padding: ${isPdf ? "0" : "40px 24px"}; background: ${isPdf ? "#fff" : "#F1F3F4"};
      font-size: 14px;
    }
    .page { background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    @media print { body { background: #fff; } .page { box-shadow: none; padding: 0; } .copy-btn { display: none; } }

    h1 { font-size: 28px; margin: 0 0 8px; color: #202124; font-weight: 700; letter-spacing: -0.3px; }
    h2 { font-size: 20px; margin: 0; color: #202124; font-weight: 600; }
    h3 { font-size: 16px; margin: 0 0 8px; color: #3C4043; font-weight: 600; }
    h4 { font-size: 14px; margin: 0 0 6px; color: #5F6368; font-weight: 600; }

    .cover {
      text-align: center; padding: 64px 0 48px;
      border-bottom: 3px solid #4285F4; margin-bottom: 40px;
      ${pageBreak}
    }
    .cover-brand {
      display: inline-flex; align-items: center; gap: 10px;
      font-size: 14px; font-weight: 600; color: #4285F4;
      letter-spacing: 1px; text-transform: uppercase;
      margin-bottom: 24px;
    }
    .cover-brand-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #EA4335;
    }
    .cover h1 { font-size: 36px; font-weight: 700; color: #202124; margin-bottom: 8px; }
    .cover-subtitle { font-size: 16px; color: #5F6368; margin-bottom: 32px; }
    .cover-meta { color: #5F6368; font-size: 13px; margin: 6px 0; }
    .cover-meta strong { color: #3C4043; }
    .score-header { display: flex; align-items: center; justify-content: center; gap: 32px; margin: 32px 0; }
    .score-info { text-align: left; }
    .score-info .grade { font-size: 24px; font-weight: 700; color: ${overall.color}; }
    .score-info .desc { font-size: 13px; color: #5F6368; margin-top: 4px; }

    .severity-dashboard {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
      margin: 24px 0; max-width: 520px; margin-left: auto; margin-right: auto;
    }
    .severity-card {
      background: #fff; border: 1px solid #E8EAED; border-radius: 8px;
      padding: 14px 8px; text-align: center;
    }
    .severity-card .count { font-size: 22px; font-weight: 700; }
    .severity-card .label { font-size: 11px; color: #5F6368; margin-top: 2px; }

    .module-card {
      background: #fff; border-radius: 12px; padding: 24px;
      margin: 20px 0; border: 1px solid #E8EAED;
      box-shadow: 0 1px 2px rgba(60,64,67,0.05);
    }
    .module-header { margin-bottom: 16px; }
    .findings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 14px 0; }
    .finding-item {
      display: flex; justify-content: space-between; background: #F8F9FA;
      padding: 10px 14px; border-radius: 8px; font-size: 13px;
    }
    .finding-label { color: #5F6368; font-weight: 500; }
    .finding-value { font-weight: 600; color: #202124; }
    .insight-box {
      background: #E8F0FE; border-left: 3px solid #4285F4;
      padding: 10px 14px; border-radius: 0 8px 8px 0;
      font-size: 13px; color: #174EA6; margin: 12px 0;
    }
    .section-title {
      font-size: 12px; font-weight: 700; color: #5F6368;
      text-transform: uppercase; letter-spacing: 0.6px;
      margin: 18px 0 10px;
    }
    .recommendations { margin-top: 8px; }
    .rec-text { color: #202124; line-height: 1.6; }
    .roi-text { color: #5F6368; font-size: 12px; }
    .template-card {
      background: #fff; padding: 12px 14px; border-radius: 8px;
      font-size: 12px; margin: 8px 0; border: 1px solid #E8EAED;
    }
    .code-label { font-size: 12px; color: #4285F4; font-weight: 600; margin-top: 12px; }
    .deployment-section { margin-top: 12px; }
    .copy-btn:hover { background: #5F6368 !important; }
    .screenshot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .screenshot-card img { max-width: 100%; }

    .exec-summary {
      background: #F8F9FA; border-radius: 12px; padding: 28px;
      margin-bottom: 32px; border: 1px solid #E8EAED;
    }
    .exec-summary p { margin: 0 0 10px; font-size: 13px; color: #3C4043; line-height: 1.7; }
    .exec-summary p:last-child { margin-bottom: 0; }

    .toc { margin: 24px 0 32px; }
    .toc-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0; border-bottom: 1px solid #F1F3F4; font-size: 13px;
    }
    .toc-item a { color: #4285F4; text-decoration: none; font-weight: 500; }
    .toc-item a:hover { text-decoration: underline; }
    .toc-score { font-size: 12px; font-weight: 600; }

    .roadmap { margin-top: 16px; }
    .roadmap-phase {
      background: #fff; border: 1px solid #E8EAED; border-radius: 12px;
      padding: 20px; margin: 16px 0;
    }
    .roadmap-phase-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    }
    .roadmap-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%; font-size: 12px; font-weight: 700;
      color: #fff;
    }
    .roadmap-list { list-style: none; padding: 0; margin: 0; }
    .roadmap-list li {
      padding: 8px 0; border-bottom: 1px solid #F1F3F4;
      font-size: 13px; color: #3C4043; display: flex; gap: 8px;
    }
    .roadmap-list li:last-child { border-bottom: none; }

    .appendix { margin-top: 16px; }
    .appendix-item { font-size: 13px; color: #5F6368; padding: 6px 0; }
  `;

  const lang = t?.language || "zh-CN";
  // Cover page
  const coverHtml = `
    <div class="cover">
      <div class="cover-brand">
        <span class="cover-brand-dot"></span>
        ${t?.("report.coverBrand") ?? "Cross-Border Diagnostic Report"}
      </div>
      <h1>${t?.("report.title") ?? "跨境出海诊断报告"}</h1>
      <div class="cover-subtitle">${t?.("report.subtitle") ?? "Google Professional Consultant Level Assessment"}</div>
      <div class="cover-meta"><strong>${t?.("report.targetWebsite") ?? "目标网站"}:</strong> ${session.url}</div>
      <div class="cover-meta"><strong>${t?.("report.targetMarket") ?? "目标市场"}:</strong> ${session.targetMarket}</div>
      <div class="cover-meta"><strong>${t?.("report.diagnosisTime") ?? "诊断时间"}:</strong> ${new Date(session.createdAt).toLocaleString(lang)}</div>
      <div class="cover-meta"><strong>${t?.("report.reportNumber") ?? "报告编号"}:</strong> RPT-${session.id.slice(-8).toUpperCase()}</div>
      <div class="score-header">
        ${renderScoreRing(avgScore, 140)}
        <div class="score-info">
          <div class="grade">${t?.("report.overallRatingLabel") ?? "综合评级"}: ${overall.label}</div>
          <div class="desc">${t?.("report.pagesDetected", { count: pages.length }) ?? `共检测 ${pages.length} 个页面`}<br/>${t?.("report.modulesCompleted", { count: completedModules.length }) ?? `${completedModules.length} 个模块已完成分析`}</div>
        </div>
      </div>
      <div class="severity-dashboard">
        <div class="severity-card">
          <div class="count" style="color:#EA4335;">${criticalCount}</div>
          <div class="label">${t?.("report.severityDashboardCritical") ?? "严重"}</div>
        </div>
        <div class="severity-card">
          <div class="count" style="color:#EA4335;">${highCount}</div>
          <div class="label">${t?.("report.severityDashboardHigh") ?? "高"}</div>
        </div>
        <div class="severity-card">
          <div class="count" style="color:#FBBC04;">${mediumCount}</div>
          <div class="label">${t?.("report.severityDashboardMedium") ?? "中"}</div>
        </div>
        <div class="severity-card">
          <div class="count" style="color:#34A853;">${lowCount}</div>
          <div class="label">${t?.("report.severityDashboardLow") ?? "低"}</div>
        </div>
      </div>
    </div>
  `;

  // Executive Summary
  const execIntro = t
    ? t("report.execSummaryIntro", { url: session.url, score: avgScore ?? "-", rating: overall.label })
    : `本报告针对 <strong>${session.url}</strong> 进行了全面的跨境出海合规与性能诊断，覆盖全球访问加速、留资页面安全、产品内容完整性以及表单数据追踪四大核心模块。综合健康评分为 <strong style="color:${overall.color};">${avgScore ?? "-"}/100</strong>，整体评级为 <strong style="color:${overall.color};">${overall.label}</strong>。`;
  const criticalMsg = criticalCount > 0
    ? (t ? t("report.criticalModulesMsg", { count: criticalCount }) : `有 <strong style="color:#EA4335;">${criticalCount} 个模块存在严重风险</strong>，需要立即处理；`)
    : "";
  const highMsg = highCount > 0
    ? (t ? t("report.highModulesMsg", { count: highCount }) : `有 <strong style="color:#EA4335;">${highCount} 个模块存在高风险</strong>，建议短期内优化；`)
    : "";
  const mediumMsg = mediumCount > 0
    ? (t ? t("report.mediumModulesMsg", { count: mediumCount }) : `有 <strong style="color:#FBBC04;">${mediumCount} 个模块表现中等</strong>，仍有提升空间；`)
    : "";
  const lowMsg = lowCount > 0
    ? (t ? t("report.lowModulesMsg", { count: lowCount }) : `有 <strong style="color:#34A853;">${lowCount} 个模块表现优秀</strong>。`)
    : "";
  const execModules = t
    ? t("report.execSummaryModules", { completed: completedModules.length, criticalMsg, highMsg, mediumMsg, lowMsg })
    : `在 ${completedModules.length} 个已完成检测的模块中，${criticalMsg}${highMsg}${mediumMsg}${lowMsg}`;
  const execRoadmap = t
    ? t("report.execSummaryRoadmap")
    : "建议按照本报告中的 <strong>30/60/90 天实施路线图</strong> 分阶段推进优化，优先解决严重和高风险问题，预计可在 90 天内显著提升网站的全球访问体验、留资转化率和数据追踪完整性。";
  const execSummaryHtml = `
    <section class="exec-summary" id="executive-summary" style="${sectionBreak}"">
      <h2 style="margin-bottom:16px;">📋 ${t?.("report.executiveSummary") ?? "执行摘要"}</h2>
      <p>${execIntro}</p>
      <p>${execModules}</p>
      <p>${execRoadmap}</p>
    </section>
  `;

  // Table of Contents
  const metaMap = getModuleMeta(t);
  let tocItems = "";
  for (const m of completedModules) {
    const meta = metaMap[m.module] || { title: m.module };
    const sev = getSeverity(m.score, t);
    tocItems += `
      <div class="toc-item">
        <a href="#module-${m.module}">${meta.title}</a>
        <span class="toc-score" style="color:${sev.color};">${m.score ?? "-"}/100 · ${sev.label}${t?.("report.severitySuffix") ?? "风险"}</span>
      </div>`;
  }
  const tocHtml = `
    <section class="toc" id="toc" style="${sectionBreak}"">
      <h2 style="margin-bottom:16px;">📑 ${t?.("report.toc") ?? "目录"}</h2>
      <div class="toc-item">
        <a href="#executive-summary">${t?.("report.executiveSummary") ?? "执行摘要"}</a>
        <span class="toc-score" style="color:#4285F4;">${t?.("report.tocOverview") ?? "概览"}</span>
      </div>
      ${tocItems}
      <div class="toc-item">
        <a href="#roadmap">${t?.("report.roadmap") ?? "30/60/90 天实施路线图"}</a>
        <span class="toc-score" style="color:#4285F4;">${t?.("report.tocActionPlan") ?? "行动计划"}</span>
      </div>
      <div class="toc-item">
        <a href="#appendix">${t?.("report.appendix") ?? "附录"}</a>
        <span class="toc-score" style="color:#4285F4;">${t?.("report.tocReferences") ?? "参考资料"}</span>
      </div>
    </section>
  `;

  // Roadmap
  const roadmapHtml = `
    <section class="roadmap" id="roadmap" style="${sectionBreak}"">
      <h2 style="margin-bottom:16px;">🗓️ ${t?.("report.roadmap") ?? "30 / 60 / 90 天实施路线图"}</h2>
      <div class="roadmap-phase">
        <div class="roadmap-phase-header">
          <div class="roadmap-badge" style="background:#EA4335;">D30</div>
          <div>
            <h3 style="margin:0;">${t?.("report.phase1Title") ?? "第 1 阶段：紧急修复（0-30 天）"}</h3>
            <div style="font-size:12px;color:#5F6368;">${t?.("report.phase1Desc") ?? "解决严重和高风险问题，建立基础安全与追踪能力"}</div>
          </div>
        </div>
        <ul class="roadmap-list">
          ${day30.length > 0 ? day30.map((r) => `<li><span>${renderPriorityBadge(r.priority, t)}</span><span>${metaMap[r.module]?.title || r.module}：${r.text}</span></li>`).join("") : `<li style="color:#5F6368;">${t?.("report.noCriticalItems") ?? "暂无紧急项 — 当前状态良好，可进入下一阶段优化。"}</li>`}
        </ul>
      </div>
      <div class="roadmap-phase">
        <div class="roadmap-phase-header">
          <div class="roadmap-badge" style="background:#FBBC04;">D60</div>
          <div>
            <h3 style="margin:0;">${t?.("report.phase2Title") ?? "第 2 阶段：能力提升（30-60 天）"}</h3>
            <div style="font-size:12px;color:#5F6368;">${t?.("report.phase2Desc") ?? "完善内容结构、增强追踪深度、优化用户体验"}</div>
          </div>
        </div>
        <ul class="roadmap-list">
          ${day60.length > 0 ? day60.map((r) => `<li><span>${renderPriorityBadge(r.priority, t)}</span><span>${metaMap[r.module]?.title || r.module}：${r.text}</span></li>`).join("") : `<li style="color:#5F6368;">${t?.("report.noMediumItems") ?? "暂无中优先级项。"}</li>`}
        </ul>
      </div>
      <div class="roadmap-phase">
        <div class="roadmap-phase-header">
          <div class="roadmap-badge" style="background:#34A853;">D90</div>
          <div>
            <h3 style="margin:0;">${t?.("report.phase3Title") ?? "第 3 阶段：持续优化（60-90 天）"}</h3>
            <div style="font-size:12px;color:#5F6368;">${t?.("report.phase3Desc") ?? "精细化运营、A/B 测试、长期监控与迭代"}</div>
          </div>
        </div>
        <ul class="roadmap-list">
          ${day90.length > 0 ? day90.map((r) => `<li><span>${renderPriorityBadge(r.priority, t)}</span><span>${metaMap[r.module]?.title || r.module}：${r.text}</span></li>`).join("") : `<li style="color:#5F6368;">${t?.("report.noLowItems") ?? "暂无低优先级项。"}</li>`}
        </ul>
      </div>
    </section>
  `;

  // Appendix
  const appendixHtml = `
    <section class="appendix" id="appendix" style="${sectionBreak}"">
      <h2 style="margin-bottom:16px;">📎 ${t?.("report.appendix") ?? "附录"}</h2>
      <div class="appendix-item"><strong>${t?.("report.toolVersion") ?? "诊断工具版本"}:</strong> Cross-Border Diagnostic Platform v1.0</div>
      <div class="appendix-item"><strong>${t?.("report.engine") ?? "检测引擎"}:</strong> Playwright + Chromium Headless</div>
      <div class="appendix-item"><strong>${t?.("report.scoringCriteria") ?? "评分标准"}:</strong> 0-39 ${t?.("report.severityCritical") ?? "严重"} / 40-59 ${t?.("report.severityHigh") ?? "高"} / 60-79 ${t?.("report.severityMedium") ?? "中"} / 80-100 ${t?.("report.severityLow") ?? "低"}</div>
      <div class="appendix-item"><strong>${t?.("report.reportGeneratedAt") ?? "报告生成时间"}:</strong> ${new Date().toLocaleString(lang)}</div>
      <div class="appendix-item"><strong>${t?.("report.sessionId") ?? "会话 ID"}:</strong> ${session.id}</div>
      <div class="appendix-item" style="margin-top:12px;color:#5F6368;font-size:12px;">
        ${t?.("report.disclaimer") ?? "本报告由 AI 辅助生成，建议结合业务实际情况进行决策。如需进一步咨询，请联系专业跨境出海顾问团队。"}
      </div>
    </section>
  `;

  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t?.("report.title") ?? "跨境出海诊断报告"} · ${session.url}</title>
  <style>${css}</style>
</head>
<body>
  <div class="page">
    ${coverHtml}
    ${execSummaryHtml}
    ${tocHtml}
    ${moduleSections}
    ${roadmapHtml}
    ${appendixHtml}
  </div>
  <script>
    function copyCode(btn) {
      const code = btn.nextElementSibling.querySelector("code").innerText;
      navigator.clipboard.writeText(code).then(() => {
        btn.innerText = "${t?.("report.copied") ?? "已复制"}";
        setTimeout(() => btn.innerText = "${t?.("report.copyCode") ?? "复制"}", 2000);
      });
    }
  </script>
</body>
</html>
  `;
}

async function generateReportPDF(session: any, pages: any[], reportDir: string, t?: any): Promise<string> {
  const html = generateReportHtml(session, pages, "pdf", t);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const fileName = `report-${session.id}.pdf`;
    const filePath = path.join(reportDir, fileName);
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
    return fileName;
  } finally {
    await browser.close();
  }
}

function generateReportMarkdown(session: any, pages: any[], t?: any): string {
  const modules = pages.flatMap((p) => p.results || []);
  const completedModules = modules.filter((m) => m.status !== "pending");

  let weightedSum = 0;
  let totalWeight = 0;
  for (const page of pages) {
    const pageModules = page.results || [];
    const scored = pageModules.filter((m: any) => m.score != null);
    if (scored.length === 0) continue;
    const pageScore = scored.reduce((a: number, m: any) => a + (m.score ?? 0), 0) / scored.length;
    const weight = page.weight ?? 1;
    weightedSum += pageScore * weight;
    totalWeight += weight;
  }
  const avgScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  const overall = getGrade(avgScore, t);

  const metaMap = getModuleMeta(t);
  const moduleNameMap: Record<string, string> = {
    global_acceleration: `⚡ ${metaMap.global_acceleration?.title ?? "全球访问加速"}`,
    lead_page_check: `🛡️ ${metaMap.lead_page_check?.title ?? "留资页面检查"}`,
    product_content_audit: `📝 ${metaMap.product_content_audit?.title ?? "产品内容梳理"}`,
    form_tracking: `📊 ${metaMap.form_tracking?.title ?? "表单数据追踪"}`,
  };

  function priorityText(p: string): string {
    return p === "critical" ? "【严重】" : p === "high" ? "【高优先级】" : p === "medium" ? "【中优先级】" : "【低优先级】";
  }

  function renderMdModule(m: any): string {
    const f = m.findings || {};
    const rd = m.reportData || {};
    const { label } = getGrade(m.score);
    let body = "";

    // Status + Score
    body += `- **状态**: ${m.status === "completed" ? "已完成" : m.status === "failed" ? "失败" : m.status}\n`;
    body += `- **评分**: ${m.score ?? "-"}/100（${label}）\n\n`;

    // Findings by module type
    if (m.module === "global_acceleration") {
      const httpInfo = f.httpProtocol || {};
      const imgOpt = f.imageOptimization || {};
      const cache = f.cacheHeaders || {};
      body += "| 指标 | 结果 |\n|---|---|\n";
      body += `| CDN | ${f.cdn?.detected ? `已部署 (${f.cdn.provider})` : "未检测到"} |\n`;
      body += `| TTFB | ${f.latency?.ttfb ?? "-"} ms |\n`;
      body += `| 页面加载 | ${f.latency?.pageLoadTime ?? "-"} ms |\n`;
      body += `| HTTP/2 | ${httpInfo.http2 ? "已启用" : httpInfo.protocol || "-"} |\n`;
      body += `| 图片优化 | ${imgOpt.optimized ? "已优化" : "需改进"} |\n`;
      body += `| 缓存策略 | ${cache.hasCacheHeaders ? "已配置" : "缺失"} |\n`;
      if (f.estimatedImprovement) {
        body += `\n> 💡 ${f.estimatedImprovement}\n`;
      }
    }

    if (m.module === "lead_page_check") {
      const vp = f.viewport || {};
      body += "| 指标 | 结果 |\n|---|---|\n";
      body += `| HTTPS | ${f.https ? "已启用" : "未启用"} |\n`;
      body += `| 安全防护 | ${f.security?.detected ? (f.security.type || "已安装") : "未安装"} |\n`;
      body += `| 表单评分 | ${f.forms?.score ?? "-"}/100 |\n`;
      body += `| 表单字段 | ${f.forms?.totalFields ?? 0} 个 |\n`;
      body += `| 移动端适配 | ${vp.mobileOptimized ? "已优化" : "未配置"} |\n`;
      body += `| CTA 文案 | ${f.forms?.ctaText || "-"} |\n`;
      if (f.interceptionRate) {
        body += `\n> 💡 ${f.interceptionRate}\n`;
      }
    }

    if (m.module === "product_content_audit") {
      const extra = f.extraContent || {};
      body += "| 内容模块 | 状态 |\n|---|---|\n";
      body += `| 合规认证 | ${f.structure?.complianceCerts?.detected ? "已包含" : "缺失"} |\n`;
      body += `| 客户背书 | ${f.structure?.customerEndorsements?.detected ? "已包含" : "缺失"} |\n`;
      body += `| 技术参数 | ${f.structure?.technicalParams?.detected ? "已包含" : "缺失"} |\n`;
      body += `| 工作原理 | ${f.structure?.workingPrinciple?.detected ? "已包含" : "缺失"} |\n`;
      body += `| FAQ | ${extra.faqDetected ? "已包含" : "缺失"} |\n`;
      body += `| 定价信息 | ${extra.pricingDetected ? "已包含" : "缺失"} |\n`;
      body += `| 视频内容 | ${extra.videoDetected ? `已包含 (${extra.videoCount || 0} 个)` : "缺失"} |\n`;
      body += `| 社交证明 | ${extra.socialProofDetected ? "已包含" : "缺失"} |\n`;
    }

    if (m.module === "form_tracking") {
      const adv = f.advancedTracking || {};
      const cookie = f.cookieConsent || {};
      body += "| 追踪项 | 状态 |\n|---|---|\n";
      body += `| GA4 基础追踪 | ${f.baseTracking?.ga4?.detected ? "已部署" : "缺失"} |\n`;
      body += `| Meta Pixel | ${f.baseTracking?.metaPixel?.detected ? "已部署" : "缺失"} |\n`;
      body += `| 表单转化追踪 | ${f.conversionTracking?.ga4Conversion?.detected || f.conversionTracking?.metaLead?.detected ? "已部署" : "缺失"} |\n`;
      body += `| PDF 下载追踪 | ${f.downloadTracking?.pdfDownload?.detected ? "已部署" : "缺失"} |\n`;
      body += `| UTM 参数 | ${f.utmCheck?.hasUtmParams || f.utmCheck?.formPreservesUtm ? "已部署" : "缺失"} |\n`;
      body += `| Cookie 合规 | ${cookie.detected ? `已部署 (${cookie.provider || ""})` : "缺失"} |\n`;
      body += `| LinkedIn Insight | ${adv.linkedInInsight?.detected ? "已部署" : "缺失"} |\n`;
      body += `| TikTok Pixel | ${adv.tikTokPixel?.detected ? "已部署" : "缺失"} |\n`;
      if (f.trackingCoverage) {
        body += `\n> 💡 ${f.trackingCoverage}\n`;
      }
    }

    // Recommendations
    if (rd.recommendations && rd.recommendations.length > 0) {
      body += "\n**优化建议**\n\n";
      for (const rec of rd.recommendations) {
        const priority = rec.includes("紧急") || rec.includes("必须") ? "critical" : rec.includes("建议") ? "medium" : "low";
        body += `- ${priorityText(priority)} ${rec}\n`;
      }
    } else if (f.missingItems && f.missingItems.length > 0) {
      body += "\n**缺失项**\n\n";
      for (const item of f.missingItems) {
        body += `- ${priorityText(item.priority)} ${item.item} — ${item.reason}\n`;
      }
    }

    // Deployment code
    if (f.deploymentCode) {
      body += "\n**部署代码**\n\n";
      if (typeof f.deploymentCode === "string") {
        body += "```html\n" + f.deploymentCode + "\n```\n";
      } else {
        for (const [key, code] of Object.entries(f.deploymentCode)) {
          if (code) {
            body += `*${key}*\n\n\`\`\`html\n${code}\n\`\`\`\n\n`;
          }
        }
      }
    }

    // Industry templates
    const templates = f.industryTemplates || f.templates || [];
    if (templates.length > 0) {
      body += "\n**行业模板**\n\n";
      for (const tmpl of templates.slice(0, 4)) {
        const fields = tmpl.fields || tmpl.sections || [];
        body += `- **${tmpl.industry}**：${fields.join("、")} — ${tmpl.tips}\n`;
      }
    }

    return `## ${moduleNameMap[m.module] || m.module}\n\n${body}`;
  }

  const moduleSections = completedModules.map((m) => renderMdModule(m)).join("\n---\n\n");

  return `# ${t?.("report.title") ?? "跨境出海诊断报告"}

**${t?.("report.targetWebsite") ?? "目标网站"}**: ${session.url}
**${t?.("report.targetMarket") ?? "目标市场"}**: ${session.targetMarket}
**${t?.("report.diagnosisTime") ?? "诊断时间"}**: ${new Date(session.createdAt).toLocaleString()}

---

## ${t?.("report.overallRating") ?? "综合评分"}

- **${t?.("report.moduleScore") ?? "总分"}**: ${avgScore ?? "-"}/100
- **${t?.("report.overallRating") ?? "评级"}**: ${overall.label}
- **${t?.("report.pagesDetected", { count: pages.length }) ?? `${pages.length} 个页面`}**
- **${t?.("report.modulesCompleted", { count: completedModules.length }) ?? `${completedModules.length} 个模块已完成`}**

---

${moduleSections}
`;
}

// ---- 分析页面（创建页面记录 + 初始化模块结果） ----

diagnosticRouter.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { url, sessionId } = req.body as { url: string; sessionId: string };
    if (!url || !sessionId) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.urlAndSessionIdRequired") ?? "url and sessionId are required" });
      return;
    }

    const normalized = normalizeUrl(url);

    // 检查 session 是否存在
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    // 创建页面记录
    const pageId = generateId("dpg");
    const page = await prisma.diagnosticPage.create({
      data: {
        id: pageId,
        sessionId,
        url: normalized,
        title: null,
        status: "analyzing",
      },
    });

    // 初始化 4 个核心模块的诊断结果
    const modules = ["global_acceleration", "lead_page_check", "product_content_audit", "form_tracking"];
    await prisma.diagnosticResult.createMany({
      data: modules.map((module) => ({
        id: generateId("dre"),
        pageId,
        module,
        status: "pending",
      })),
    });

    // 异步分析：复用一个浏览器实例顺序执行 4 个模块
    (async () => {
      let browser: any;
      try {
        browser = await chromium.launch({ headless: true });
        const p = await browser.newPage();
        try {
          await p.goto(normalized, { waitUntil: "networkidle", timeout: 60000 });
        } catch {
          await p.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        const title = await p.title();
        await prisma.diagnosticPage.update({
          where: { id: pageId },
          data: { title },
        });

        // 顺序执行 4 个模块分析，共享同一 page
        await analyzeGlobalAcceleration(pageId, normalized, p, session.targetMarket).catch(
          (e) => console.error("MOD-001 analysis failed:", e)
        );
        await analyzeLeadPage(pageId, normalized, p).catch(
          (e) => console.error("MOD-002 analysis failed:", e)
        );
        await analyzeProductContent(pageId, normalized, p).catch(
          (e) => console.error("MOD-003 analysis failed:", e)
        );
        await analyzeFormTracking(pageId, normalized, p).catch(
          (e) => console.error("MOD-004 analysis failed:", e)
        );

        await browser.close();
        browser = undefined;

        await prisma.diagnosticPage.update({
          where: { id: pageId },
          data: { status: "completed" },
        });
      } catch (e) {
        if (browser) await browser.close().catch(() => {});
        await prisma.diagnosticPage.update({
          where: { id: pageId },
          data: { status: "completed" },
        });
      }
    })();

    // 返回页面记录和初始化的模块结果
    const pageWithResults = await prisma.diagnosticPage.findUnique({
      where: { id: pageId },
      include: { results: true },
    });

    res.status(201).json(pageWithResults);
  } catch (err) {
    console.error("analyze error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.analyzeFailed") ?? "analyze failed", message: (err as Error).message });
  }
});

// ---- 获取页面详情（含模块结果） ----

diagnosticRouter.get("/page/:id", async (req: Request, res: Response) => {
  try {
    const page = await prisma.diagnosticPage.findUnique({
      where: { id: req.params.id as string },
      include: { results: true },
    });

    if (!page) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.pageNotFound") ?? "page not found" });
      return;
    }

    res.json(page);
  } catch (err) {
    console.error("get page error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 获取用户诊断历史 ----

diagnosticRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: (req as any).t?.("apiErrors.unauthorized") ?? "unauthorized" });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const skip = (page - 1) * limit;

    const sessions = await prisma.diagnosticSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        pages: {
          include: { results: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const total = await prisma.diagnosticSession.count({
      where: { userId: user.id },
    });

    const items = sessions.map((session) => {
      const pages = session.pages;
      let weightedSum = 0;
      let totalWeight = 0;
      for (const page of pages) {
        const pageModules = page.results || [];
        const scored = pageModules.filter((m) => m.score != null);
        if (scored.length === 0) continue;
        const pageScore = scored.reduce((a, m) => a + (m.score ?? 0), 0) / scored.length;
        const weight = page.weight ?? 1;
        weightedSum += pageScore * weight;
        totalWeight += weight;
      }
      let overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

      const modulesSummary = pages.flatMap((p) => p.results || []).map((m) => ({
        module: m.module,
        status: m.status,
        score: m.score,
      }));

      // Agent session fallback: compute score from agentSteps tool findings
      if (overallScore == null && session.agentSteps) {
        try {
          const steps = session.agentSteps as any[];
          const toolStep = steps.find((s) => s.name === "tool_execution" || s.step === 2);
          const toolResults = toolStep?.result || [];
          let totalFindings = 0;
          let findingSum = 0;
          for (const tr of toolResults) {
            for (const f of tr.findings || []) {
              totalFindings++;
              if (f.status === "pass") findingSum += 100;
              else if (f.status === "warn") findingSum += 60;
              else if (f.status === "fail") findingSum += 20;
            }
          }
          if (totalFindings > 0) {
            overallScore = Math.round(findingSum / totalFindings);
          }
          // Also build modulesSummary from agent tool results
          if (modulesSummary.length === 0) {
            for (const tr of toolResults) {
              const passCount = tr.findings?.filter((f: any) => f.status === "pass").length || 0;
              const totalCount = tr.findings?.length || 0;
              const moduleScore = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : null;
              modulesSummary.push({
                module: tr.module,
                status: tr.error ? "failed" : "completed",
                score: moduleScore,
              });
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      const reportSummary = session.reportMarkdown
        ? session.reportMarkdown.slice(0, 200).replace(/\s+/g, " ").trim()
        : null;

      return {
        sessionId: session.id,
        targetUrl: session.url,
        targetMarket: session.targetMarket,
        createdAt: session.createdAt,
        status: session.status,
        overallScore,
        modulesSummary,
        pagesCount: pages.length,
        reportSummary,
        type: session.agentSteps ? 'agent' : 'legacy',
      };
    });

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("history error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- 删除诊断会话 ----

diagnosticRouter.delete("/session/:id", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: (req as any).t?.("apiErrors.unauthorized") ?? "unauthorized" });
      return;
    }

    const sessionId = req.params.id as string;
    const session = await prisma.diagnosticSession.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    await prisma.diagnosticSession.delete({ where: { id: sessionId } });
    res.json({ success: true });
  } catch (err) {
    console.error("delete session error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.deleteFailed") ?? "delete failed" });
  }
});

// ---- 报告生成 ----

diagnosticRouter.post("/report", async (req: Request, res: Response) => {
  const t = (req as any).t;
  const reportErr = t?.("apiErrors.reportGenerationFailed") ?? "report generation failed";
  try {
    const { sessionId, format } = req.body as { sessionId: string; format?: "pdf" | "markdown" | "html" };
    if (!sessionId) {
      res.status(400).json({ error: t?.("apiErrors.sessionIdRequired") ?? "sessionId is required" });
      return;
    }

    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
      include: {
        pages: {
          include: { results: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: t?.("apiErrors.sessionNotFound") ?? "session not found" });
      return;
    }

    const outputFormat = format || "pdf";
    const reportDir = path.join(process.cwd(), "diagnostic/reports");
    fs.mkdirSync(reportDir, { recursive: true });

    if (outputFormat === "html") {
      const html = generateReportHtml(session, session.pages, "html", t);
      const fileName = `report-${sessionId}.html`;
      const filePath = path.join(reportDir, fileName);
      fs.writeFileSync(filePath, html);
      res.json({ downloadUrl: `/reports/${fileName}`, format: "html" });
      return;
    }

    if (outputFormat === "markdown") {
      const markdown = generateReportMarkdown(session, session.pages, t);
      const fileName = `report-${sessionId}.md`;
      const filePath = path.join(reportDir, fileName);
      fs.writeFileSync(filePath, markdown);
      res.json({ downloadUrl: `/reports/${fileName}`, format: "markdown" });
      return;
    }

    // PDF 生成
    const pdfFileName = await generateReportPDF(session, session.pages, reportDir, t);
    res.json({ downloadUrl: `/reports/${pdfFileName}`, format: "pdf" });
  } catch (err) {
    console.error("report error:", err);
    res.status(500).json({ error: reportErr, message: (err as Error).message });
  }
});
