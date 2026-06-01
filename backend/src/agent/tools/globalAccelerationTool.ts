import { withPage, ToolResult } from "./_helper";

export async function globalAccelerationTool(url: string): Promise<ToolResult> {
  return withPage(url, async (page) => {
    const findings: ToolResult["findings"] = [];

    // CDN detection via headers
    const cdnHeaders = await page.evaluate(async () => {
      try {
        const resp = await fetch(location.href, { method: "HEAD", mode: "no-cors" });
        const h: Record<string, string> = {};
        resp.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
        return h;
      } catch {
        return {} as Record<string, string>;
      }
    });

    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(cdnHeaders)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    const cdnDetected = !!(lowerHeaders["cf-ray"] || lowerHeaders["x-akamai"] || lowerHeaders["x-cache"] || lowerHeaders["x-cdn"] || lowerHeaders["x-vercel-cache"] || lowerHeaders["x-amz-cf-id"] || lowerHeaders["x-bunny-cache"] || lowerHeaders["x-edge-location"] || (lowerHeaders["server"] && /cloudfront|cloudflare|gws|netlify|fastly/.test(lowerHeaders["server"])));
    findings.push({
      check: "CDN 部署检测",
      status: cdnDetected ? "pass" : "fail",
      detail: cdnDetected ? "检测到 CDN 加速服务" : "未检测到 CDN，建议部署以提升全球访问速度",
      evidence: cdnDetected ? Object.keys(lowerHeaders).filter(k => /cdn|cache|ray|edge/.test(k)).join(", ") : undefined,
    });

    // Performance metrics
    const timing: any = await page.evaluate(`
      (() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return nav ? {
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          pageLoadTime: Math.round(nav.loadEventEnd - nav.fetchStart),
          totalBytes: nav.transferSize || 0,
        } : { ttfb: -1, pageLoadTime: -1, totalBytes: 0 };
      })()
    `);

    const ttfb = timing.ttfb ?? -1;
    const loadTime = timing.pageLoadTime ?? -1;

    findings.push({
      check: "首字节时间 (TTFB)",
      status: ttfb < 0 ? "warn" : ttfb < 1000 ? "pass" : ttfb < 2000 ? "warn" : "fail",
      detail: ttfb < 0 ? "无法测量 TTFB" : `TTFB: ${ttfb}ms`,
      evidence: `页面加载时间: ${loadTime}ms, 传输大小: ${timing.totalBytes} bytes`,
    });

    // HTTP/2 & HTTP/3
    const altSvc = lowerHeaders["alt-svc"] || "";
    const via = lowerHeaders["via"] || "";
    const http3 = altSvc.includes("h3=");
    const http2 = http3 || via.includes("2.0") || lowerHeaders[":authority"] !== undefined;

    findings.push({
      check: "HTTP/2 或 HTTP/3 支持",
      status: http2 ? "pass" : "fail",
      detail: http3 ? "支持 HTTP/3" : http2 ? "支持 HTTP/2" : "未检测到 HTTP/2/3，建议启用以提升并发加载性能",
      evidence: http3 ? `Alt-Svc: ${altSvc}` : http2 ? `Via: ${via}` : undefined,
    });

    // Image optimization
    const imgResult: any = await page.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll('img[src]'));
        const srcs = imgs.map(i => (i.src || '').toLowerCase());
        return {
          webpUsed: srcs.some(s => s.endsWith('.webp')),
          avifUsed: srcs.some(s => s.endsWith('.avif')),
          pictureTagUsed: document.querySelectorAll('picture').length > 0,
          totalImages: imgs.length,
        };
      })()
    `);

    const modernFormats = imgResult.webpUsed || imgResult.avifUsed || imgResult.pictureTagUsed;
    findings.push({
      check: "图片格式优化",
      status: modernFormats ? "pass" : "warn",
      detail: modernFormats
        ? `使用现代图片格式 (WebP: ${imgResult.webpUsed}, AVIF: ${imgResult.avifUsed})`
        : "未使用 WebP/AVIF 等现代图片格式，建议转换以减少体积",
      evidence: `总图片数: ${imgResult.totalImages}`,
    });

    // Cache headers
    const cacheControl = lowerHeaders["cache-control"];
    findings.push({
      check: "缓存配置",
      status: cacheControl ? "pass" : "warn",
      detail: cacheControl ? `Cache-Control: ${cacheControl}` : "未检测到 Cache-Control 头部，建议配置以利用浏览器缓存",
      evidence: cacheControl || undefined,
    });

    return { module: "global_acceleration", findings };
  });
}
