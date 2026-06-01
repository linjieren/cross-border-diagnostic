import { withPage, ToolResult } from "./_helper";

export async function leadPageTool(url: string): Promise<ToolResult> {
  return withPage(url, async (page) => {
    const findings: ToolResult["findings"] = [];

    // HTTPS
    findings.push({
      check: "HTTPS 加密",
      status: url.startsWith("https://") ? "pass" : "fail",
      detail: url.startsWith("https://") ? "网站已启用 HTTPS" : "网站未使用 HTTPS，存在数据泄露风险",
    });

    // Security plugins
    const secResult: any = await page.evaluate(`
      (() => {
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src.toLowerCase());
        const html = document.documentElement.innerHTML.toLowerCase();

        const hasRecaptcha = scripts.some(s => s.includes('recaptcha')) || html.includes('grecaptcha');
        const hasTurnstile = scripts.some(s => s.includes('turnstile')) || html.includes('window.turnstile');
        const hasHcaptcha = scripts.some(s => s.includes('hcaptcha')) || html.includes('window.hcaptcha');

        return { hasRecaptcha, hasTurnstile, hasHcaptcha };
      })()
    `);

    const hasSecurity = secResult.hasRecaptcha || secResult.hasTurnstile || secResult.hasHcaptcha;
    findings.push({
      check: "表单安全防护",
      status: hasSecurity ? "pass" : "fail",
      detail: hasSecurity
        ? `检测到: ${[secResult.hasRecaptcha && "reCAPTCHA", secResult.hasTurnstile && "Cloudflare Turnstile", secResult.hasHcaptcha && "hCaptcha"].filter(Boolean).join(", ")}`
        : "未检测到任何表单安全防护（reCAPTCHA/Turnstile/hCaptcha），建议立即部署",
    });

    // Form analysis
    const formResult: any = await page.evaluate(`
      (() => {
        const forms = Array.from(document.querySelectorAll('form'));
        const allInputs = forms.flatMap(f => Array.from(f.querySelectorAll('input, textarea, select')));
        const names = allInputs.map(i => ((i.name || '') + ' ' + (i.placeholder || '')).toLowerCase());

        return {
          formCount: forms.length,
          totalFields: allInputs.length,
          hasName: names.some(n => n.includes('name') || n.includes('姓名')),
          hasEmail: names.some(n => n.includes('email') || n.includes('邮箱')),
          hasPhone: names.some(n => n.includes('phone') || n.includes('tel') || n.includes('电话')),
          hasCompany: names.some(n => n.includes('company') || n.includes('公司')),
          hasMessage: names.some(n => n.includes('message') || n.includes('comment') || n.includes('留言')),
        };
      })()
    `);

    const formScore = [formResult.hasName, formResult.hasEmail, formResult.hasPhone, formResult.hasCompany, formResult.hasMessage].filter(Boolean).length;
    findings.push({
      check: "表单字段完整性",
      status: formScore >= 4 ? "pass" : formScore >= 2 ? "warn" : "fail",
      detail: `发现 ${formResult.formCount} 个表单，共 ${formResult.totalFields} 个字段。包含: ${[formResult.hasName && "姓名", formResult.hasEmail && "邮箱", formResult.hasPhone && "电话", formResult.hasCompany && "公司", formResult.hasMessage && "留言"].filter(Boolean).join(", ") || "无关键字段"}`,
    });

    // Thank You page
    const tyResult: any = await page.evaluate(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        const patterns = ['thank you', 'thanks', 'submitted', 'success', 'confirmation', 'received', '提交成功', '感谢您的'];
        const matched = patterns.filter(p => text.includes(p));
        return { detected: matched.length > 0, indicators: matched };
      })()
    `);

    findings.push({
      check: "Thank You 页面/成功提示",
      status: tyResult.detected ? "pass" : "warn",
      detail: tyResult.detected ? `检测到成功提示关键词: ${tyResult.indicators.slice(0, 3).join(", ")}` : "未检测到提交后的 Thank You 页面或成功提示",
    });

    // Mobile viewport
    const vpResult: any = await page.evaluate(`
      (() => {
        const vp = document.querySelector('meta[name="viewport"]');
        const content = vp ? vp.getAttribute('content') : null;
        return {
          configured: !!vp,
          mobileOptimized: content ? (content.includes('width=device-width') && content.includes('initial-scale=')) : false,
        };
      })()
    `);

    findings.push({
      check: "移动端适配",
      status: vpResult.mobileOptimized ? "pass" : vpResult.configured ? "warn" : "fail",
      detail: vpResult.mobileOptimized ? "已正确配置 viewport" : vpResult.configured ? "viewport 配置不完整" : "未配置 viewport meta 标签",
    });

    return { module: "lead_page_check", findings };
  });
}
