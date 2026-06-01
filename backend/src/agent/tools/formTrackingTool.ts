import { withPage, ToolResult } from "./_helper";

export async function formTrackingTool(url: string): Promise<ToolResult> {
  return withPage(url, async (page) => {
    const findings: ToolResult["findings"] = [];

    const result: any = await page.evaluate(`
      (() => {
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src.toLowerCase());
        const html = document.documentElement.innerHTML.toLowerCase();

        // GA4
        const ga4Detected = scripts.some(s => s.includes('googletagmanager.com/gtag')) || html.includes('gtag(');
        let ga4Id = null;
        if (ga4Detected) {
          const m = html.match(/gtag\\('config',\\s*['"](G-[A-Z0-9]+)['"]/i);
          if (m) ga4Id = m[1];
        }

        // Meta Pixel
        const metaDetected = scripts.some(s => s.includes('connect.facebook.net') && s.includes('fbevents.js')) || html.includes('fbq(');
        let metaId = null;
        if (metaDetected) {
          const m = html.match(/fbq\\('init',\\s*['"](\\d+)['"]/);
          if (m) metaId = m[1];
        }

        // GTM
        const gtmDetected = scripts.some(s => s.includes('googletagmanager.com/gtm.js'));

        // LinkedIn
        const liDetected = scripts.some(s => s.includes('snap.licdn.com')) || html.includes('_linkedin_partner_id');

        // TikTok
        const ttDetected = scripts.some(s => s.includes('analytics.tiktok.com')) || html.includes('ttq.track');

        // Clarity
        const clarityDetected = scripts.some(s => s.includes('clarity.ms')) || html.includes('window.clarity');

        // Cookie consent
        const cookieTexts = ['cookie', 'gdpr', 'privacy', '同意', '隐私'];
        const hasCookieBanner = document.querySelectorAll('#cookie-banner, .cookie-banner, .cookie-consent, .cc-window, #onetrust-consent-sdk').length > 0;
        const cookieDetected = hasCookieBanner || cookieTexts.some(t => document.body.innerText.toLowerCase().includes(t));

        // Conversion events
        const ga4Conv = html.includes("gtag('event', 'conversion'") || html.includes("gtag('event', 'generate_lead'") || html.includes("gtag('event', 'submit_form'");
        const metaConv = html.includes("fbq('track', 'lead'") || html.includes("fbq('track', 'contact'");

        // UTM
        const urlObj = new URL(location.href);
        const hasUtm = urlObj.searchParams.has('utm_source') || urlObj.searchParams.has('utm_medium') || urlObj.searchParams.has('utm_campaign');

        return {
          ga4Detected, ga4Id, metaDetected, metaId, gtmDetected,
          liDetected, ttDetected, clarityDetected,
          cookieDetected, ga4Conv, metaConv, hasUtm,
        };
      })()
    `);

    findings.push({ check: "GA4 基础追踪", status: result.ga4Detected ? "pass" : "fail", detail: result.ga4Detected ? `检测到 GA4 (${result.ga4Id || "ID 未识别"})` : "未检测到 GA4 追踪代码", evidence: result.ga4Id || undefined });
    findings.push({ check: "Meta Pixel 基础追踪", status: result.metaDetected ? "pass" : "fail", detail: result.metaDetected ? `检测到 Meta Pixel (${result.metaId || "ID 未识别"})` : "未检测到 Meta Pixel 追踪代码", evidence: result.metaId || undefined });
    findings.push({ check: "GTM 部署", status: result.gtmDetected ? "pass" : "warn", detail: result.gtmDetected ? "检测到 Google Tag Manager" : "未检测到 GTM，建议部署以统一管理追踪代码" });
    findings.push({ check: "表单转化追踪", status: result.ga4Conv || result.metaConv ? "pass" : "fail", detail: result.ga4Conv || result.metaConv ? `检测到: ${[result.ga4Conv && "GA4 转化", result.metaConv && "Meta Lead"].filter(Boolean).join(", ")}` : "未检测到表单提交后的转化事件追踪" });
    findings.push({ check: "LinkedIn Insight Tag", status: result.liDetected ? "pass" : "warn", detail: result.liDetected ? "检测到 LinkedIn Insight Tag" : "未检测到 LinkedIn 追踪，B2B 场景建议部署" });
    findings.push({ check: "TikTok Pixel", status: result.ttDetected ? "pass" : "warn", detail: result.ttDetected ? "检测到 TikTok Pixel" : "未检测到 TikTok 追踪，面向年轻受众时建议部署" });
    findings.push({ check: "行为分析工具", status: result.clarityDetected ? "pass" : "warn", detail: result.clarityDetected ? "检测到 Microsoft Clarity" : "未检测到 Clarity/Hotjar，建议部署以分析用户行为" });
    findings.push({ check: "Cookie 合规", status: result.cookieDetected ? "pass" : "fail", detail: result.cookieDetected ? "检测到 Cookie 同意横幅或隐私声明" : "未检测到 Cookie 合规提示，建议添加以满足 GDPR/CCPA 要求" });
    findings.push({ check: "UTM 参数", status: result.hasUtm ? "pass" : "warn", detail: result.hasUtm ? "当前 URL 包含 UTM 参数" : "未检测到 UTM 参数，建议配置以追踪广告来源效果" });

    return { module: "form_tracking", findings };
  });
}
