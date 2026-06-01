import { Page } from "playwright";
import { prisma } from "../prisma";

interface BaseTracking {
  ga4: {
    detected: boolean;
    measurementId: string | null;
  };
  metaPixel: {
    detected: boolean;
    pixelId: string | null;
  };
  gtm: {
    detected: boolean;
    containerId: string | null;
  };
}

interface AdvancedTracking {
  linkedInInsight: {
    detected: boolean;
    partnerId: string | null;
  };
  tikTokPixel: {
    detected: boolean;
    pixelId: string | null;
  };
  googleAds: {
    detected: boolean;
    conversionId: string | null;
  };
  microsoftClarity: {
    detected: boolean;
    projectId: string | null;
  };
  hotjar: {
    detected: boolean;
    siteId: string | null;
  };
}

interface CookieConsent {
  detected: boolean;
  provider: string | null;
  hasBanner: boolean;
}

interface ConversionTracking {
  thankYouPage: {
    detected: boolean;
    method: string;
    url: string;
  };
  ga4Conversion: {
    detected: boolean;
    events: string[];
  };
  metaLead: {
    detected: boolean;
    events: string[];
  };
}

interface DownloadTracking {
  pdfDownload: {
    detected: boolean;
    events: string[];
  };
  whitepaperDownload: {
    detected: boolean;
    events: string[];
  };
}

interface UtmCheck {
  hasUtmParams: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  formPreservesUtm: boolean;
}

interface MOD004Findings {
  baseTracking: BaseTracking;
  advancedTracking: AdvancedTracking;
  cookieConsent: CookieConsent;
  conversionTracking: ConversionTracking;
  downloadTracking: DownloadTracking;
  utmCheck: UtmCheck;
  score: number;
  trackingCoverage: string;
  deploymentCode: {
    ga4Conversion: string;
    metaPixelLead: string;
    pdfDownload: string;
    linkedInInsight: string;
    tikTokPixel: string;
    clarity: string;
  };
  utmGuide: string;
  validationSteps: string[];
}

// ---- 基础追踪代码检测 ----
async function detectBaseTracking(page: any): Promise<BaseTracking> {
  const result: any = await page.evaluate(`
    (() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const scriptSrcs = scripts.map(s => s.src.toLowerCase());
      const html = document.documentElement.innerHTML.toLowerCase();

      // GA4 detection
      const ga4Script = scriptSrcs.find(s => s.includes('googletagmanager.com/gtag'));
      const ga4Inline = html.includes('gtag(');
      const ga4Detected = !!ga4Script || ga4Inline;
      let measurementId = null;
      if (ga4Detected) {
        const match = html.match(/gtag\\('config',\\s*['"](G-[A-Z0-9]+)['"]/i);
        if (match) measurementId = match[1];
      }

      // Meta Pixel detection
      const metaScript = scriptSrcs.find(s => s.includes('connect.facebook.net') && s.includes('fbevents.js'));
      const metaInline = html.includes('fbq(');
      const metaDetected = !!metaScript || metaInline;
      let pixelId = null;
      if (metaDetected) {
        const match = html.match(/fbq\\('init',\\s*['"](\\d+)['"]/);
        if (match) pixelId = match[1];
      }

      // GTM detection
      const gtmScript = scriptSrcs.find(s => s.includes('googletagmanager.com/gtm.js'));
      const gtmDetected = !!gtmScript;
      let containerId = null;
      if (gtmDetected) {
        const match = html.match(/gtm-[a-z0-9]+/i);
        if (match) containerId = match[0].toUpperCase();
      }

      return {
        ga4: { detected: ga4Detected, measurementId },
        metaPixel: { detected: metaDetected, pixelId },
        gtm: { detected: gtmDetected, containerId },
      };
    })()
  `);
  return result;
}

// ---- 高级追踪代码检测（LinkedIn / TikTok / Google Ads / Clarity / Hotjar） ----
async function detectAdvancedTracking(page: any): Promise<AdvancedTracking> {
  const result: any = await page.evaluate(`
    (() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const scriptSrcs = scripts.map(s => s.src.toLowerCase());
      const html = document.documentElement.innerHTML.toLowerCase();

      // LinkedIn Insight Tag
      const liScript = scriptSrcs.find(s => s.includes('snap.licdn.com') && s.includes('insight.min.js'));
      const liInline = html.includes('_linkedin_partner_id') || html.includes('linkedininsighttag');
      const liDetected = !!liScript || liInline;
      let liPartnerId = null;
      if (liDetected) {
        const match = html.match(/_linkedin_partner_id\\s*=\\s*(\\d+)/);
        if (match) liPartnerId = match[1];
      }

      // TikTok Pixel
      const ttScript = scriptSrcs.find(s => s.includes('analytics.tiktok.com') || s.includes('ttq.js'));
      const ttInline = html.includes('ttq.track') || html.includes('ttq.pageview');
      const ttDetected = !!ttScript || ttInline;
      let ttPixelId = null;
      if (ttDetected) {
        const match = html.match(/ttq\\.load\\(['"]([a-z0-9]+)['"]\\)/i) || html.match(/s\\/[a-z0-9]+\\/ttq\\.js/i);
        if (match) ttPixelId = match[1] || match[0];
      }

      // Google Ads Conversion Tracking
      const gadsScript = scriptSrcs.find(s => s.includes('googleadservices.com') || s.includes('conversion_async.js'));
      const gadsInline = html.includes('gtag_report_conversion') || html.includes('aw-');
      const gadsDetected = !!gadsScript || gadsInline;
      let gadsId = null;
      if (gadsDetected) {
        const match = html.match(/aw-\\d+/);
        if (match) gadsId = match[0];
      }

      // Microsoft Clarity
      const clarityScript = scriptSrcs.find(s => s.includes('clarity.ms'));
      const clarityInline = html.includes('clarity(') || html.includes('window.clarity');
      const clarityDetected = !!clarityScript || clarityInline;
      let clarityProjectId = null;
      if (clarityDetected) {
        const match = html.match(/clarity\\s*\\(\\s*['"]([a-z0-9]+)['"]\\)/i);
        if (match) clarityProjectId = match[1];
      }

      // Hotjar
      const hjScript = scriptSrcs.find(s => s.includes('static.hotjar.com'));
      const hjInline = html.includes('hjid') || html.includes('hotjar');
      const hjDetected = !!hjScript || hjInline;
      let hjSiteId = null;
      if (hjDetected) {
        const match = html.match(/hjid\\s*:\\s*(\\d+)/);
        if (match) hjSiteId = match[1];
      }

      return {
        linkedInInsight: { detected: liDetected, partnerId: liPartnerId },
        tikTokPixel: { detected: ttDetected, pixelId: ttPixelId },
        googleAds: { detected: gadsDetected, conversionId: gadsId },
        microsoftClarity: { detected: clarityDetected, projectId: clarityProjectId },
        hotjar: { detected: hjDetected, siteId: hjSiteId },
      };
    })()
  `);
  return result;
}

// ---- Cookie Consent / CMP 检测 ----
async function detectCookieConsent(page: any): Promise<CookieConsent> {
  const result: any = await page.evaluate(`
    (() => {
      const html = document.documentElement.innerHTML.toLowerCase();
      const text = document.body.innerText.toLowerCase();

      const bannerSelectors = [
        '#cookie-banner', '.cookie-banner', '.cookie-consent', '.cookie-notice',
        '#gdpr-banner', '.gdpr-notice', '.cc-window', '#onetrust-consent-sdk',
        '.osano-cm-window', '.cookiebot', '.CybotCookiebotDialog'
      ];
      const hasBanner = bannerSelectors.some(sel => document.querySelector(sel) !== null);

      const providers = [
        { name: 'OneTrust', patterns: ['onetrust', 'optanon'] },
        { name: 'Cookiebot', patterns: ['cookiebot', 'cybot'] },
        { name: 'Osano', patterns: ['osano'] },
        { name: 'iubenda', patterns: ['iubenda'] },
        { name: 'Complianz', patterns: ['complianz'] },
        { name: 'Termly', patterns: ['termly'] },
      ];

      let provider = null;
      for (const p of providers) {
        if (p.patterns.some(pat => html.includes(pat))) {
          provider = p.name;
          break;
        }
      }

      const consentTexts = ['cookie', 'cookies', 'gdpr', 'privacy', '同意', '隐私'];
      const detected = hasBanner || consentTexts.some(t => text.includes(t));

      return { detected, provider, hasBanner };
    })()
  `);
  return result;
}

// ---- Thank You 页面检测 ----
async function detectThankYouPage(page: any, originalUrl: string): Promise<ConversionTracking['thankYouPage']> {
  const result: any = await page.evaluate(`
    (() => {
      const url = location.href.toLowerCase();
      const text = document.body.innerText.toLowerCase();

      const urlPatterns = ['thank', 'success', 'confirm', 'complete', 'submitted'];
      const textPatterns = ['thank you', 'thanks', 'submitted', 'success', 'confirmation', 'received', 'we will contact', '提交成功', '感谢您的'];

      const urlMatch = urlPatterns.some(p => url.includes(p));
      const textMatch = textPatterns.some(p => text.includes(p));

      return {
        detected: urlMatch || textMatch,
        method: urlMatch ? 'URL redirect' : textMatch ? 'Page content' : 'None',
        url: location.href,
      };
    })()
  `);
  return result;
}

// ---- 转化事件检测 ----
async function detectConversionEvents(page: any): Promise<{ ga4: ConversionTracking['ga4Conversion']; meta: ConversionTracking['metaLead'] }> {
  const result: any = await page.evaluate(`
    (() => {
      const html = document.documentElement.innerHTML.toLowerCase();
      const text = document.body.innerText.toLowerCase();

      // GA4 conversion events
      const ga4Events = [];
      if (html.includes("gtag('event', 'conversion'") || html.includes('gtag("event", "conversion"')) {
        ga4Events.push('gtag conversion');
      }
      if (html.includes("gtag('event', 'submit_form'") || html.includes('gtag("event", "submit_form"')) {
        ga4Events.push('gtag submit_form');
      }
      if (html.includes("gtag('event', 'generate_lead'") || html.includes('gtag("event", "generate_lead"')) {
        ga4Events.push('gtag generate_lead');
      }
      if (html.includes("gtag('event', 'purchase'") || html.includes('gtag("event", "purchase"')) {
        ga4Events.push('gtag purchase');
      }

      // Meta Pixel lead events
      const metaEvents = [];
      if (html.includes("fbq('track', 'lead'") || html.includes('fbq("track", "lead"')) {
        metaEvents.push('fbq Lead');
      }
      if (html.includes("fbq('track', 'submitapplication'") || html.includes('fbq("track", "submitapplication"')) {
        metaEvents.push('fbq SubmitApplication');
      }
      if (html.includes("fbq('track', 'contact'") || html.includes('fbq("track", "contact"')) {
        metaEvents.push('fbq Contact');
      }
      if (html.includes("fbq('track', 'complete_registration'") || html.includes('fbq("track", "complete_registration"')) {
        metaEvents.push('fbq CompleteRegistration');
      }

      return {
        ga4: { detected: ga4Events.length > 0, events: ga4Events },
        meta: { detected: metaEvents.length > 0, events: metaEvents },
      };
    })()
  `);
  return result;
}

// ---- 下载事件追踪检测 ----
async function detectDownloadTracking(page: any): Promise<DownloadTracking> {
  const result: any = await page.evaluate(`
    (() => {
      const html = document.documentElement.innerHTML.toLowerCase();
      const links = Array.from(document.querySelectorAll('a[href]'));
      const pdfLinks = links.filter(a => (a.href || '').toLowerCase().endsWith('.pdf'));
      const docLinks = links.filter(a => {
        const h = (a.href || '').toLowerCase();
        return h.endsWith('.doc') || h.endsWith('.docx') || h.endsWith('.xls') || h.endsWith('.xlsx');
      });

      // GA4 download tracking
      const ga4Download = html.includes("gtag('event', 'file_download'") || html.includes('gtag("event", "file_download"');

      // Meta Pixel download tracking (often uses Lead or Custom event)
      const metaDownload = html.includes("fbq('track', 'lead'") || html.includes('fbq("track", "lead"');

      return {
        pdfDownload: {
          detected: ga4Download || metaDownload || pdfLinks.length > 0,
          events: [
            ...(ga4Download ? ['gtag file_download'] : []),
            ...(metaDownload ? ['fbq Lead on download'] : []),
            ...(pdfLinks.length > 0 ? [\`\${pdfLinks.length} PDF links found\`] : []),
          ],
        },
        whitepaperDownload: {
          detected: ga4Download || metaDownload || docLinks.length > 0,
          events: [
            ...(ga4Download ? ['gtag file_download'] : []),
            ...(metaDownload ? ['fbq Lead on download'] : []),
            ...(docLinks.length > 0 ? [\`\${docLinks.length} document links found\`] : []),
          ],
        },
      };
    })()
  `);
  return result;
}

// ---- UTM 参数检测 ----
async function detectUtmParams(page: any, originalUrl: string): Promise<UtmCheck> {
  const result: any = await page.evaluate(`
    (() => {
      const url = new URL(location.href);
      const hasUtmParams = url.searchParams.has('utm_source') || url.searchParams.has('utm_medium') || url.searchParams.has('utm_campaign');

      // Check if forms might preserve UTM (look for hidden fields or URL params in form action)
      const forms = Array.from(document.querySelectorAll('form'));
      const hasUtmHidden = forms.some(f => {
        const inputs = Array.from(f.querySelectorAll('input[type="hidden"]'));
        return inputs.some(i => (i.name || '').toLowerCase().includes('utm'));
      });

      return {
        hasUtmParams,
        utmSource: url.searchParams.get('utm_source'),
        utmMedium: url.searchParams.get('utm_medium'),
        utmCampaign: url.searchParams.get('utm_campaign'),
        formPreservesUtm: hasUtmHidden,
      };
    })()
  `);
  return result;
}

// ---- 评分计算 ----
function calculateScore(
  base: BaseTracking,
  advanced: AdvancedTracking,
  cookieConsent: CookieConsent,
  conversion: ConversionTracking,
  download: DownloadTracking,
  utm: UtmCheck
): { score: number; coverage: string } {
  const checks = [
    base.ga4.detected || base.metaPixel.detected, // 基础追踪
    conversion.ga4Conversion.detected || conversion.metaLead.detected, // 表单转化追踪
    download.pdfDownload.detected, // 下载事件追踪
    utm.hasUtmParams || utm.formPreservesUtm, // UTM 参数
    cookieConsent.detected, // Cookie 合规
    advanced.linkedInInsight.detected || advanced.tikTokPixel.detected || advanced.googleAds.detected, // 广告平台追踪
    advanced.microsoftClarity.detected || advanced.hotjar.detected, // 行为分析
  ];

  const passed = checks.filter(Boolean).length;
  const total = checks.length;
  const percentage = Math.round((passed / total) * 100);

  const coverage = passed === total
    ? `追踪覆盖率 ${percentage}%，所有关键追踪均已部署`
    : `追踪覆盖率 ${percentage}%，缺少 ${total - passed} 项关键追踪`;

  return { score: percentage, coverage };
}

// ---- 部署代码生成 ----
function generateDeploymentCode(): MOD004Findings['deploymentCode'] {
  const ga4Conversion = `<!-- GA4 表单转化追踪代码 — 粘贴到 Thank You 页面 -->
<script>
  // 方法 1：标准转化事件
  gtag('event', 'conversion', {
    'send_to': 'GA_MEASUREMENT_ID',
    'value': 1.0,
    'currency': 'USD'
  });

  // 方法 2：生成潜在客户事件（推荐）
  gtag('event', 'generate_lead', {
    'currency': 'USD',
    'value': 1.0
  });
</script>

<!--
部署步骤：
1. 将 GA_MEASUREMENT_ID 替换为你的 GA4 衡量 ID（如 G-XXXXXXXXXX）
2. 将代码粘贴到 Thank You 页面的 <head> 内（GA4 基础代码之后）
3. 或粘贴到 <body> 底部
4. 进入 GA4 → 实时报告 → 验证事件是否正常触发
-->`;

  const metaPixelLead = `<!-- Meta Pixel Lead 事件代码 — 粘贴到 Thank You 页面 -->
<script>
  fbq('track', 'Lead', {
    content_name: 'Contact Form',
    content_category: 'Lead Generation',
    value: 1.00,
    currency: 'USD'
  });
</script>

<!--
部署步骤：
1. 确保页面已加载 Meta Pixel 基础代码（fbevents.js）
2. 将上方代码粘贴到 Thank You 页面 <body> 底部
3. 进入 Meta 事件管理工具 → 测试事件 → 验证 Lead 事件
-->`;

  const pdfDownload = `<!-- PDF 下载事件追踪 — 粘贴到下载按钮的 onclick 中 -->
<script>
  function trackPdfDownload(fileName) {
    // GA4 下载事件
    gtag('event', 'file_download', {
      file_name: fileName,
      file_extension: 'pdf',
    });

    // Meta Pixel 自定义事件
    fbq('trackCustom', 'PDFDownload', {
      file_name: fileName,
    });
  }
</script>

<!-- 在下载链接上使用： -->
<a href="whitepaper.pdf" onclick="trackPdfDownload('whitepaper.pdf')">
  下载白皮书
</a>

<!--
部署步骤：
1. 将 trackPdfDownload 函数粘贴到页面 <head> 内
2. 在每个 PDF/白皮书下载链接上添加 onclick="trackPdfDownload('文件名.pdf')"
3. 进入 GA4 实时报告 → 筛选 file_download 事件验证
-->`;

  const linkedInInsight = `<!-- LinkedIn Insight Tag — 粘贴到全站 <head> -->
<script type="text/javascript">
_linkedin_partner_id = "YOUR_PARTNER_ID";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
(function(l) {
  if (!l) {
    window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
    window.lintrk.q=[];
  }
  var s = document.getElementsByTagName("script")[0];
  var b = document.createElement("script");
  b.type = "text/javascript";b.async = true;
  b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
  s.parentNode.insertBefore(b, s);
})(window.lintrk);
</script>
<noscript>
  <img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=YOUR_PARTNER_ID&fmt=gif" />
</noscript>

<!--
部署步骤：
1. 在 LinkedIn Campaign Manager → 账户资产 → Insight Tag 获取 Partner ID
2. 替换 YOUR_PARTNER_ID
3. 粘贴到网站所有页面的 <head> 内
4. 在 Campaign Manager 中验证标签安装
-->`;

  const tikTokPixel = `<!-- TikTok Pixel — 粘贴到全站 <head> -->
<script>
!function (w, d, t) {
  var ttq = w.ttq = w.ttq || [];
  ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
  ttq.setAndDefer = function(t, e) { t[e] = function() { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
  for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
  ttq.instance = function(t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
  ttq.load = function(e, n) {
    var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {}, ttq._i[e] = [], ttq._i[e]._u = i, ttq._t = ttq._t || {}, ttq._t[e] = +new Date, ttq._o = ttq._o || {}, ttq._o[e] = n || {};
    var o = document.createElement("script"); o.type = "text/javascript", o.async = !0, o.src = i + "?sdkid=" + e + "&lib=" + t;
    var a = document.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a);
  };
  ttq.load('YOUR_PIXEL_ID');
  ttq.page();
}(window, document, 'ttq');
</script>

<!--
部署步骤：
1. 在 TikTok Ads Manager → 资产 → 事件 → 网站 Pixel 获取 Pixel ID
2. 替换 YOUR_PIXEL_ID
3. 粘贴到网站所有页面的 <head> 内
4. 在 Ads Manager 中使用 Pixel Helper 验证
-->`;

  const clarity = `<!-- Microsoft Clarity — 粘贴到全站 <head> -->
<script type="text/javascript">
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "YOUR_PROJECT_ID");
</script>

<!--
部署步骤：
1. 访问 https://clarity.microsoft.com 注册/登录
2. 创建新项目，复制项目 ID
3. 替换 YOUR_PROJECT_ID
4. 粘贴到所有页面 <head> 内
5. 在 Clarity 仪表板确认数据开始收集
-->`;

  return { ga4Conversion, metaPixelLead, pdfDownload, linkedInInsight, tikTokPixel, clarity };
}

// ---- UTM 参数配置指南 ----
function generateUtmGuide(): string {
  return `## UTM 参数配置指南

### 1. 在广告链接中添加 UTM 参数
在投放 Google Ads、Facebook Ads 等广告时，在目标链接后添加：
\`\`\`
https://yoursite.com/contact?utm_source=google&utm_medium=cpc&utm_campaign=spring2024
\`\`\`

常用参数：
- utm_source: 流量来源（google, facebook, linkedin, email）
- utm_medium: 媒介类型（cpc, social, email, banner）
- utm_campaign: 活动名称（spring2024, product_launch）
- utm_content: 广告素材标识（ad_variant_a, banner_1）

### 2. 在表单中保留 UTM 参数
在表单页面添加隐藏字段，自动读取 URL 中的 UTM：
\`\`\`html
<script>
  const params = new URLSearchParams(location.search);
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(key => {
    const el = document.getElementById(key);
    if (el) el.value = params.get(key) || '';
  });
</script>
<input type="hidden" id="utm_source" name="utm_source">
<input type="hidden" id="utm_medium" name="utm_medium">
<input type="hidden" id="utm_campaign" name="utm_campaign">
\`\`\`

### 3. 在 CRM/后台中查看 UTM 数据
确保表单提交时将 UTM 字段一并发送到后端，存储到 CRM 或数据库中。`;
}

// ---- 验证步骤 ----
function generateValidationSteps(): string[] {
  return [
    "打开 Chrome 开发者工具 → Network 面板 → 筛选 'collect'，确认 GA4 请求正常发送",
    "进入 GA4 实时报告 → 查看最近 30 分钟的事件，确认 conversion/generate_lead 出现",
    "进入 Meta 事件管理工具 → 测试事件 → 在网站上触发表单提交 → 确认 Lead 事件收到",
    "点击 PDF 下载按钮 → 在 Network 中搜索 'file_download' → 确认事件触发",
    "在广告链接添加 ?utm_source=test → 提交表单 → 在后台确认 UTM 参数被正确记录",
    "LinkedIn Campaign Manager → Insight Tag → 确认网站显示 '标签已激活'",
    "TikTok Ads Manager → 事件管理 → Pixel 助手 → 确认 PageView 和事件正常",
    "Microsoft Clarity 仪表板 → 录制 → 确认用户会话录制正常收集",
  ];
}

// ---- 主分析函数 ----

export async function analyzeFormTracking(pageId: string, url: string, page: Page): Promise<void> {
  const result = await prisma.diagnosticResult.findFirst({
    where: { pageId, module: "form_tracking" },
  });
  if (!result) return;

  await prisma.diagnosticResult.update({
    where: { id: result.id },
    data: { status: "analyzing" },
  });

  try {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const [baseTracking, advancedTracking, cookieConsent, thankYouPage, conversionEvents, downloadTracking, utmCheck] = await Promise.all([
      detectBaseTracking(page),
      detectAdvancedTracking(page),
      detectCookieConsent(page),
      detectThankYouPage(page, url),
      detectConversionEvents(page),
      detectDownloadTracking(page),
      detectUtmParams(page, url),
    ]);

    const conversionTracking: ConversionTracking = {
      thankYouPage,
      ga4Conversion: conversionEvents.ga4,
      metaLead: conversionEvents.meta,
    };

    const { score, coverage } = calculateScore(baseTracking, advancedTracking, cookieConsent, conversionTracking, downloadTracking, utmCheck);
    const deploymentCode = generateDeploymentCode();
    const utmGuide = generateUtmGuide();
    const validationSteps = generateValidationSteps();

    const findings: MOD004Findings = {
      baseTracking,
      advancedTracking,
      cookieConsent,
      conversionTracking,
      downloadTracking,
      utmCheck,
      score,
      trackingCoverage: coverage,
      deploymentCode,
      utmGuide,
      validationSteps,
    };

    const hasBase = baseTracking.ga4.detected || baseTracking.metaPixel.detected;
    const hasConversion = conversionTracking.ga4Conversion.detected || conversionTracking.metaLead.detected;
    const hasAdvanced = advancedTracking.linkedInInsight.detected || advancedTracking.tikTokPixel.detected || advancedTracking.googleAds.detected;
    const hasBehavioral = advancedTracking.microsoftClarity.detected || advancedTracking.hotjar.detected;

    const recommendations: string[] = [
      ...(hasBase ? [] : ['紧急：部署 GA4 或 Meta Pixel 基础追踪代码']),
      ...(hasConversion ? [] : ['建议：在 Thank You 页面添加转化事件追踪']),
      ...(downloadTracking.pdfDownload.detected ? [] : ['建议：为 PDF/白皮书下载添加事件追踪']),
      ...(utmCheck.hasUtmParams || utmCheck.formPreservesUtm ? [] : ['建议：配置 UTM 参数传递，追踪广告来源效果']),
      ...(thankYouPage.detected ? [] : ['注意：未检测到 Thank You 页面，建议设置独立的成功跳转页']),
      ...(cookieConsent.detected ? [] : ['建议：添加 Cookie 同意横幅（如 Cookiebot / OneTrust），满足 GDPR/CCPA 合规']),
      ...(hasAdvanced ? [] : ['建议：针对 B2B 受众部署 LinkedIn Insight Tag；针对年轻受众部署 TikTok Pixel']),
      ...(hasBehavioral ? [] : ['建议：部署 Microsoft Clarity 或 Hotjar，通过会话录制和热力图优化转化漏斗']),
    ];

    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        score,
        findings: findings as any,
        reportData: {
          summary: hasBase
            ? `基础追踪已部署（${baseTracking.ga4.detected ? 'GA4' : ''}${baseTracking.metaPixel.detected ? ' Meta Pixel' : ''}），${coverage}`
            : `未检测到任何基础追踪代码（GA4/Meta Pixel），${coverage}，建议立即部署`,
          recommendations,
          deploymentCode,
          utmGuide,
          validationSteps,
        } as any,
      },
    });
  } catch (err) {
    console.error(`MOD-004 analysis error for page ${pageId}:`, err);
    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: { status: "failed" },
    });
  }
}
