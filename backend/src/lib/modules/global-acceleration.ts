import { Page } from "playwright";
import { prisma } from "../prisma";

interface LatencyMetrics {
  ttfb: number;
  dnsTime: number;
  sslTime: number;
  pageLoadTime: number;
  totalBytes: number;
  numRequests: number;
}

interface CdnInfo {
  detected: boolean;
  provider: string | null;
  headers: Record<string, string>;
}

interface YoutubeVideo {
  title: string;
  url: string;
  channel: string;
  views: string;
}

interface HttpProtocolInfo {
  http2: boolean;
  http3: boolean;
  tlsVersion: string | null;
}

interface ImageOptimizationInfo {
  webpSupported: boolean;
  avifSupported: boolean;
  modernFormatsUsed: boolean;
}

interface CacheInfo {
  cacheControlPresent: boolean;
  cacheableResources: number;
  ttl: string | null;
}

interface MOD001Findings {
  latency: LatencyMetrics;
  latencyGrade: "excellent" | "good" | "poor";
  cdn: CdnInfo;
  httpProtocol: HttpProtocolInfo;
  imageOptimization: ImageOptimizationInfo;
  cache: CacheInfo;
  needsOptimization: boolean;
  deploymentCode: {
    cloudflare: string;
    akamai: string;
  };
  tutorials: YoutubeVideo[];
  estimatedImprovement: string;
}

// CDN detection via response headers
function detectCdn(headers: Record<string, string>): CdnInfo {
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  if (lowerHeaders["cf-ray"]) {
    return { detected: true, provider: "Cloudflare", headers: { "cf-ray": lowerHeaders["cf-ray"] } };
  }
  if (lowerHeaders["x-akamai"] || lowerHeaders["x-akamai-request-id"]) {
    return { detected: true, provider: "Akamai", headers: { "x-akamai": lowerHeaders["x-akamai"] || lowerHeaders["x-akamai-request-id"] } };
  }
  if (lowerHeaders["x-cache"] && lowerHeaders["x-cache"].toLowerCase().includes("fastly")) {
    return { detected: true, provider: "Fastly", headers: { "x-cache": lowerHeaders["x-cache"] } };
  }
  if (lowerHeaders["x-cdn"] || lowerHeaders["cdn"]) {
    return { detected: true, provider: lowerHeaders["x-cdn"] || lowerHeaders["cdn"], headers };
  }
  if (lowerHeaders["server"] && lowerHeaders["server"].toLowerCase().includes("cloudfront")) {
    return { detected: true, provider: "AWS CloudFront", headers: { server: lowerHeaders["server"] } };
  }
  if (lowerHeaders["x-vercel-cache"]) {
    return { detected: true, provider: "Vercel", headers: { "x-vercel-cache": lowerHeaders["x-vercel-cache"] } };
  }
  if (lowerHeaders["x-edge-location"] || lowerHeaders["x-amz-cf-id"]) {
    return { detected: true, provider: "AWS CloudFront", headers };
  }
  if (lowerHeaders["x-bunny-cache"]) {
    return { detected: true, provider: "BunnyCDN", headers: { "x-bunny-cache": lowerHeaders["x-bunny-cache"] } };
  }
  if (lowerHeaders["x-keycdn"]) {
    return { detected: true, provider: "KeyCDN", headers: { "x-keycdn": lowerHeaders["x-keycdn"] } };
  }
  if (lowerHeaders["x-sucuri-cache"]) {
    return { detected: true, provider: "Sucuri", headers: { "x-sucuri-cache": lowerHeaders["x-sucuri-cache"] } };
  }
  if (lowerHeaders["x-goog-generation"] || lowerHeaders["x-guploader-uploadid"]) {
    return { detected: true, provider: "Google Cloud CDN", headers };
  }
  if (lowerHeaders["x-azure-ref"] || lowerHeaders["x-msedge-ref"]) {
    return { detected: true, provider: "Azure CDN", headers };
  }
  if (lowerHeaders["x-stackpath-uuid"]) {
    return { detected: true, provider: "StackPath", headers: { "x-stackpath-uuid": lowerHeaders["x-stackpath-uuid"] } };
  }
  if (lowerHeaders["x-ar-cache"]) {
    return { detected: true, provider: "ArvanCloud", headers: { "x-ar-cache": lowerHeaders["x-ar-cache"] } };
  }
  if (lowerHeaders["server"] && lowerHeaders["server"].toLowerCase().includes("gws")) {
    return { detected: true, provider: "Google", headers: { server: lowerHeaders["server"] } };
  }
  if (lowerHeaders["server"] && lowerHeaders["server"].toLowerCase().includes("netlify")) {
    return { detected: true, provider: "Netlify", headers: { server: lowerHeaders["server"] } };
  }

  return { detected: false, provider: null, headers: {} };
}

// Collect performance metrics via Playwright
async function measurePerformance(page: Page, url: string): Promise<LatencyMetrics> {
  try {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      // networkidle 不可达时回退到 domcontentloaded
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const timing: LatencyMetrics = await page.evaluate(`
      (() => {
        const navEntries = performance.getEntriesByType("navigation");
        const t = navEntries.length > 0 ? navEntries[0] : null;
        const resourceEntries = performance.getEntriesByType("resource");
        return {
          ttfb: t ? Math.round(t.responseStart - t.requestStart) : -1,
          dnsTime: t ? Math.round(t.domainLookupEnd - t.domainLookupStart) : -1,
          sslTime: t ? Math.round(t.connectEnd - t.secureConnectionStart) : -1,
          pageLoadTime: t ? Math.round(t.loadEventEnd - t.fetchStart) : -1,
          totalBytes: (t && t.transferSize) || 0,
          numRequests: resourceEntries.length,
        };
      })()
    `) as LatencyMetrics;

    return timing;
  } catch {
    return { ttfb: -1, dnsTime: -1, sslTime: -1, pageLoadTime: -1, totalBytes: 0, numRequests: 0 };
  }
}

// Detect HTTP/2, HTTP/3 and TLS version from headers
function detectHttpProtocol(headers: Record<string, string>): HttpProtocolInfo {
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  const altSvc = lowerHeaders["alt-svc"] || "";
  const via = lowerHeaders["via"] || "";
  const statusLine = lowerHeaders[":status"] || "";

  const http3 = altSvc.includes("h3=") || altSvc.includes("h3-29=");
  const http2 = http3 || via.includes("2.0") || lowerHeaders[":authority"] !== undefined;

  let tlsVersion: string | null = null;
  if (lowerHeaders["strict-transport-security"]) tlsVersion = "TLS 1.2+ (HSTS enabled)";
  if (lowerHeaders["x-forwarded-proto"] === "https") tlsVersion = "TLS (via proxy)";

  return { http2, http3, tlsVersion };
}

// Detect image format support by checking accept headers and page content
async function detectImageOptimization(page: any): Promise<ImageOptimizationInfo> {
  const result: any = await page.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img[src]'));
      const srcs = imgs.map(i => (i.src || '').toLowerCase());
      const webpUsed = srcs.some(s => s.endsWith('.webp'));
      const avifUsed = srcs.some(s => s.endsWith('.avif'));
      const pictureTagUsed = document.querySelectorAll('picture').length > 0;
      return {
        webpUsed,
        avifUsed,
        pictureTagUsed,
        totalImages: imgs.length,
      };
    })()
  `);

  return {
    webpSupported: result.webpUsed || result.pictureTagUsed,
    avifSupported: result.avifUsed,
    modernFormatsUsed: result.webpUsed || result.avifUsed || result.pictureTagUsed,
  };
}

// Analyze cache headers from main document and key resources
function analyzeCacheHeaders(headers: Record<string, string>): CacheInfo {
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  const cacheControl = lowerHeaders["cache-control"];
  const expires = lowerHeaders["expires"];
  const etag = lowerHeaders["etag"];

  return {
    cacheControlPresent: !!cacheControl,
    cacheableResources: cacheControl ? 1 : 0,
    ttl: cacheControl || expires || (etag ? "ETag validation" : null),
  };
}

function getLatencyGrade(ttfb: number): "excellent" | "good" | "poor" {
  if (ttfb < 0) return "poor";
  if (ttfb < 1000) return "excellent";
  if (ttfb < 2000) return "good";
  return "poor";
}

function generateDeploymentCode(): {
  cloudflare: string;
  akamai: string;
} {
  const cloudflare = `<!-- Cloudflare CDN 部署代码 -->
<!-- 将以下 <script> 标签粘贴到网站 <head> 标签内 -->
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_CLOUDFLARE_TOKEN"}'>
</script>
<!--
部署步骤：
1. 在 cloudflare.com 注册账号
2. 添加你的域名，系统会自动扫描现有 DNS 记录
3. 将域名 DNS 服务器修改为 Cloudflare 分配的 NS 地址
4. 等待 DNS 生效（通常 5-30 分钟）
5. 在 SSL/TLS 选项卡中启用 "Full" 加密模式
6. 在 Speed 选项卡中启用 Auto Minify (JS/CSS/HTML)
-->`;

  const akamai = `<!-- Akamai CDN 部署代码 -->
<script>
(function() {
  // Akamai CDN 通过修改 DNS CNAME 指向 Akamai Edge 节点部署
  // 无需在页面中嵌入代码
  console.log('Akamai CDN deployed via DNS CNAME');
})();
</script>
<!--
Akamai 部署步骤：
1. 联系 Akamai 销售获取账号 (https://www.akamai.com)
2. 在 Akamai Control Center 配置 Property
3. 设置 Origin Server 指向你的源站 IP/域名
4. 将网站域名的 CNAME 记录指向 Akamai Edge Hostname
5. 等待 DNS 生效后，全球流量将经过 Akamai 加速
6. 在 Ion/SureRoute 中配置性能优化规则
-->`;

  return { cloudflare, akamai };
}

// Curated YouTube tutorials (fallback when no API access)
function getCuratedTutorials(): YoutubeVideo[] {
  return [
    {
      title: "How to Setup Cloudflare CDN for Your Website (Full Tutorial)",
      url: "https://www.youtube.com/watch?v=1pGtCsNcYt0",
      channel: "Cloudflare",
      views: "2.1M",
    },
    {
      title: "Cloudflare CDN Full Setup Guide 2024 - Speed Up Your Website",
      url: "https://www.youtube.com/watch?v=KFdF-u-vM20",
      channel: "Ferdy Korpershoek",
      views: "890K",
    },
    {
      title: "Akamai CDN Setup Tutorial for Beginners",
      url: "https://www.youtube.com/watch?v=YqcCDiMK8xc",
      channel: "Akamai Technologies",
      views: "320K",
    },
  ];
}

async function getCdnHeaders(url: string): Promise<Record<string, string>> {
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow" });
    const headers: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  } catch {
    return {};
  }
}

// ---- 主分析函数 ----

export async function analyzeGlobalAcceleration(
  pageId: string,
  url: string,
  page: Page,
  _targetMarket: string
): Promise<void> {
  // 标记为分析中
  const result = await prisma.diagnosticResult.findFirst({
    where: { pageId, module: "global_acceleration" },
  });
  if (!result) return;

  await prisma.diagnosticResult.update({
    where: { id: result.id },
    data: { status: "analyzing" },
  });

  try {
    // 并行收集：CDN 检测 + 性能测量 + 页面内容
    const [cdnHeaders, latency] = await Promise.all([
      getCdnHeaders(url),
      measurePerformance(page, url),
    ]);

    const cdn = detectCdn(cdnHeaders);
    const httpProtocol = detectHttpProtocol(cdnHeaders);
    const cache = analyzeCacheHeaders(cdnHeaders);
    const latencyGrade = getLatencyGrade(latency.ttfb);
    const needsOptimization = latencyGrade === "poor" || latency.ttfb > 2000 || !cdn.detected;

    // 额外：用共享 page 检测图片优化
    let imageOptimization: ImageOptimizationInfo = {
      webpSupported: false,
      avifSupported: false,
      modernFormatsUsed: false,
    };
    try {
      imageOptimization = await detectImageOptimization(page);
    } catch {
      // 图片检测失败不影响主流程
    }

    const deploymentCode = generateDeploymentCode();
    const tutorials = getCuratedTutorials();

    const score = Math.min(100, Math.round(
      (cdn.detected ? 30 : 0) +
      (latencyGrade === "excellent" ? 35 : latencyGrade === "good" ? 25 : 10) +
      (httpProtocol.http2 ? 10 : 0) +
      (httpProtocol.http3 ? 5 : 0) +
      (imageOptimization.modernFormatsUsed ? 10 : 0) +
      (cache.cacheControlPresent ? 10 : 0)
    ));

    const recommendations: string[] = [];
    if (!cdn.detected) {
      recommendations.push("部署 CDN 加速（Cloudflare 免费版即可入手）");
    }
    if (!httpProtocol.http2) {
      recommendations.push("启用 HTTP/2 以提升多资源并行加载速度");
    }
    if (!imageOptimization.modernFormatsUsed) {
      recommendations.push("使用 WebP/AVIF 格式图片替代 JPEG/PNG，可减少 30-50% 体积");
    }
    if (!cache.cacheControlPresent) {
      recommendations.push("配置 Cache-Control 头部，利用浏览器缓存减少重复请求");
    }
    if (latencyGrade === "poor") {
      recommendations.push("启用 Gzip/Brotli 压缩，减少传输体积");
      recommendations.push("减少第三方脚本数量和阻塞渲染资源");
    }
    if (recommendations.length === 0) {
      recommendations.push("当前性能优秀，可考虑进一步监控 Core Web Vitals");
    }

    const findings: MOD001Findings = {
      latency,
      latencyGrade,
      cdn,
      httpProtocol,
      imageOptimization,
      cache,
      needsOptimization,
      deploymentCode,
      tutorials,
      estimatedImprovement: cdn.detected
        ? `已部署 CDN (${cdn.provider})，当前性能已受益于 CDN 加速。${httpProtocol.http3 ? "HTTP/3 就绪。" : ""}`
        : latencyGrade === "poor"
        ? "部署 CDN 后预计延迟可降低 40-60%，启用 HTTP/2 可再提升 20%"
        : "部署 CDN 可进一步提升全球访问速度约 20-30%",
    };

    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        score,
        findings: findings as any,
        reportData: {
          summary: cdn.detected
            ? `CDN 已部署 (${cdn.provider})，TTFB: ${latency.ttfb}ms，页面加载: ${latency.pageLoadTime}ms，HTTP/2: ${httpProtocol.http2 ? "是" : "否"}`
            : `未检测到 CDN，TTFB: ${latency.ttfb}ms（评级: ${latencyGrade}），建议部署 CDN 加速`,
          recommendations,
          tutorials,
          deploymentCode,
          httpProtocol,
          imageOptimization,
          cache,
        } as any,
      },
    });
  } catch (err) {
    console.error(`MOD-001 analysis error for page ${pageId}:`, err);
    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: { status: "failed" },
    });
  }
}
