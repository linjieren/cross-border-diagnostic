import { Page } from "playwright";
import { prisma } from "../prisma";

interface SecurityPlugin {
  type: "recaptcha_v2" | "recaptcha_v3" | "cloudflare_turnstile" | "honeypot" | "hcaptcha" | "datadome" | null;
  detected: boolean;
  details: Record<string, any>;
}

interface FormField {
  name: string;
  type: string;
  required: boolean;
  label: string;
}

interface FormAnalysis {
  formCount: number;
  totalFields: number;
  requiredFields: number;
  fieldTypes: string[];
  hasName: boolean;
  hasEmail: boolean;
  hasCompany: boolean;
  hasPhone: boolean;
  hasMessage: boolean;
  score: number;
}

interface FormStructure {
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    placeholder?: string;
    selector?: string;
  }>;
  totalFields: number;
  requiredCount: number;
  ctaText: string | null;
  hasThankYouPage: boolean;
}

interface ViewportInfo {
  viewportConfigured: boolean;
  viewportContent: string | null;
  mobileOptimized: boolean;
}

interface LeadPageFindings {
  https: boolean;
  security: SecurityPlugin;
  forms: FormAnalysis;
  formStructure: FormStructure;
  thankYouPage: {
    detected: boolean;
    method: string;
    indicators: string[];
  };
  viewport?: ViewportInfo;
  deploymentCode: {
    recaptcha: string;
    turnstile: string;
  };
  tutorials: Array<{
    title: string;
    url: string;
    channel: string;
    views: string;
  }>;
  industryTemplates: Array<{
    industry: string;
    fields: string[];
    tips: string;
  }>;
  interceptionRate: string;
}

// Detect reCAPTCHA and Cloudflare Turnstile via string-based evaluate
async function detectSecurityPlugins(page: any): Promise<SecurityPlugin> {
  const result = await page.evaluate(`
    (() => {
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      const scriptSrcs = scripts.map((s) => s.src.toLowerCase());

      const hasRecaptchaScript = scriptSrcs.some((s) =>
        s.includes("google.com/recaptcha") || s.includes("gstatic.com/recaptcha")
      );
      const hasGrecaptcha = typeof window.grecaptcha !== "undefined";
      const recaptchaElements = document.querySelectorAll(".g-recaptcha, [data-sitekey]");
      const recaptchaVersion = hasGrecaptcha && window.grecaptcha?.execute
        ? "v3"
        : hasRecaptchaScript || recaptchaElements.length > 0
        ? "v2"
        : null;

      const hasTurnstileScript = scriptSrcs.some((s) =>
        s.includes("challenges.cloudflare.com/turnstile")
      );
      const hasTurnstileObject = typeof window.turnstile !== "undefined";
      const turnstileElements = document.querySelectorAll(".cf-turnstile, [data-sitekey]");

      const honeypotFields = Array.from(document.querySelectorAll("input")).filter(
        (input) => {
          const style = window.getComputedStyle(input);
          return (
            input.name?.toLowerCase().includes("honeypot") ||
            input.name?.toLowerCase().includes("website") ||
            input.name?.toLowerCase().includes("url") ||
            (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
          );
        }
      );

      // hCaptcha detection
      const hasHcaptchaScript = scriptSrcs.some((s) =>
        s.includes("hcaptcha.com") || s.includes("js.hcaptcha")
      );
      const hasHcaptchaObject = typeof window.hcaptcha !== "undefined";
      const hcaptchaElements = document.querySelectorAll(".h-captcha, [data-hcaptcha-sitekey]");

      // DataDome detection
      const hasDatadomeScript = scriptSrcs.some((s) =>
        s.includes("datadome.co") || s.includes("js.datadome")
      );
      const hasDatadomeObject = typeof window.ddObj !== "undefined" || typeof window.DataDome !== "undefined";

      return {
        recaptcha: {
          detected: hasRecaptchaScript || hasGrecaptcha || recaptchaElements.length > 0,
          version: recaptchaVersion,
          scriptCount: scriptSrcs.filter((s) => s.includes("recaptcha")).length,
          elementCount: recaptchaElements.length,
        },
        turnstile: {
          detected: hasTurnstileScript || hasTurnstileObject || turnstileElements.length > 0,
          scriptCount: scriptSrcs.filter((s) => s.includes("turnstile")).length,
          elementCount: turnstileElements.length,
        },
        honeypot: {
          detected: honeypotFields.length > 0,
          fieldCount: honeypotFields.length,
        },
        hcaptcha: {
          detected: hasHcaptchaScript || hasHcaptchaObject || hcaptchaElements.length > 0,
          scriptCount: scriptSrcs.filter((s) => s.includes("hcaptcha")).length,
          elementCount: hcaptchaElements.length,
        },
        datadome: {
          detected: hasDatadomeScript || hasDatadomeObject,
          scriptCount: scriptSrcs.filter((s) => s.includes("datadome")).length,
        },
      };
    })()
  `) as any;

  if (result.recaptcha.detected) {
    return {
      type: result.recaptcha.version === "v3" ? "recaptcha_v3" : "recaptcha_v2",
      detected: true,
      details: result.recaptcha,
    };
  }
  if (result.turnstile.detected) {
    return {
      type: "cloudflare_turnstile",
      detected: true,
      details: result.turnstile,
    };
  }
  if (result.honeypot.detected) {
    return {
      type: "honeypot",
      detected: true,
      details: result.honeypot,
    };
  }
  if (result.hcaptcha.detected) {
    return {
      type: "hcaptcha",
      detected: true,
      details: result.hcaptcha,
    };
  }
  if (result.datadome.detected) {
    return {
      type: "datadome",
      detected: true,
      details: result.datadome,
    };
  }

  return { type: null, detected: false, details: {} };
}

// Analyze forms via string-based evaluate
async function analyzeForms(page: any): Promise<{ analysis: FormAnalysis; fields: Array<{ name: string; type: string; required: boolean; placeholder?: string; selector?: string }>; ctaText: string | null }> {
  const forms: any[] = await page.evaluate(`
    (() => {
      const allForms = Array.from(document.querySelectorAll("form"));
      return allForms.map((form, formIdx) => {
        const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
        const fields = inputs.map((el, idx) => {
          const label =
            form.querySelector('label[for="' + el.id + '"]')?.textContent ||
            el.getAttribute("placeholder") ||
            el.name ||
            "";
          const tag = el.tagName.toLowerCase();
          const type = tag === "textarea" ? "textarea" : (el.type || "text");
          const selector = tag === "input"
            ? 'form:nth-of-type(' + (formIdx + 1) + ') input[name="' + (el.name || '') + '"], form:nth-of-type(' + (formIdx + 1) + ') input:nth-of-type(' + (idx + 1) + ')'
            : tag === "textarea"
            ? 'form:nth-of-type(' + (formIdx + 1) + ') textarea:nth-of-type(' + (idx + 1) + ')'
            : 'form:nth-of-type(' + (formIdx + 1) + ') select:nth-of-type(' + (idx + 1) + ')';
          return {
            name: label.trim() || el.name || el.id || el.getAttribute("placeholder") || "",
            type,
            required: el.required,
            placeholder: el.getAttribute("placeholder") || undefined,
            selector,
          };
        });

        // Detect CTA text from submit button
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        const ctaText = submitBtn ? (submitBtn.textContent || submitBtn.value || "").trim() : null;

        return {
          fields,
          action: form.action || "",
          method: form.method || "get",
          ctaText,
        };
      });
    })()
  `);

  const allFields = forms.flatMap((f: any) => f.fields);
  const fieldNames = allFields.map((f: any) => (f.name || '').toLowerCase());
  const fieldLabels = allFields.map((f: any) => (f.label || '').toLowerCase());

  const hasName = fieldNames.some((n: string) => n.includes("name") || n.includes("姓名")) ||
    fieldLabels.some((l: string) => l.includes("name") || l.includes("姓名"));
  const hasEmail = fieldNames.some((n: string) => n.includes("email") || n.includes("邮件")) ||
    fieldLabels.some((l: string) => l.includes("email") || l.includes("邮箱"));
  const hasCompany = fieldNames.some((n: string) => n.includes("company") || n.includes("公司")) ||
    fieldLabels.some((l: string) => l.includes("company") || l.includes("公司"));
  const hasPhone = fieldNames.some((n: string) => n.includes("phone") || n.includes("tel") || n.includes("电话")) ||
    fieldLabels.some((l: string) => l.includes("phone") || l.includes("电话"));
  const hasMessage = fieldNames.some((n: string) => n.includes("message") || n.includes("comment") || n.includes("留言")) ||
    fieldLabels.some((l: string) => l.includes("message") || l.includes("留言"));

  const uniqueTypes = [...new Set(allFields.map((f: any) => f.type))];
  const requiredCount = allFields.filter((f: any) => f.required).length;

  let score = 0;
  score += hasName ? 20 : 0;
  score += hasEmail ? 20 : 0;
  score += hasCompany ? 15 : 0;
  score += hasPhone ? 15 : 0;
  score += hasMessage ? 15 : 0;
  score += allFields.length >= 4 ? 15 : allFields.length * 3;

  const ctaText = forms.length > 0 ? (forms[0].ctaText || null) : null;

  const analysis: FormAnalysis = {
    formCount: forms.length,
    totalFields: allFields.length,
    requiredFields: requiredCount,
    fieldTypes: uniqueTypes,
    hasName,
    hasEmail,
    hasCompany,
    hasPhone,
    hasMessage,
    score: Math.min(100, score),
  };

  return {
    analysis,
    fields: allFields.map((f: any) => ({
      name: f.name,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      selector: f.selector,
    })),
    ctaText,
  };
}

// Check for Thank You page indicators
async function detectThankYou(page: any): Promise<LeadPageFindings["thankYouPage"]> {
  const result: any = await page.evaluate(`
    (() => {
      const text = document.body.innerText.toLowerCase();
      const indicators = [];

      const patterns = [
        "thank you", "thanks", "submitted", "success", "confirmation",
        "received", "we will contact",
        "我们会尽快联系", "提交成功", "感谢您的",
      ];

      for (const pattern of patterns) {
        if (text.includes(pattern)) indicators.push(pattern);
      }

      const thankYouUrl = location.href.toLowerCase().includes("thank") ||
        location.href.toLowerCase().includes("success") ||
        location.href.toLowerCase().includes("confirm");

      return { detected: indicators.length > 0 || thankYouUrl, urlMatch: thankYouUrl, indicators };
    })()
  `);

  return {
    detected: result.detected,
    method: result.urlMatch ? "URL redirect" : result.indicators.length > 0 ? "Page content" : "None",
    indicators: result.indicators,
  };
}

// Detect viewport meta tag for mobile optimization
async function detectViewport(page: any): Promise<ViewportInfo> {
  const result: any = await page.evaluate(`
    (() => {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const viewportContent = viewportMeta ? viewportMeta.getAttribute('content') : null;
      const viewportConfigured = !!viewportMeta;

      // Basic mobile optimization checks
      const mobileOptimized = viewportConfigured && (
        viewportContent.includes('width=device-width') ||
        viewportContent.includes('initial-scale=')
      );

      return { viewportConfigured, viewportContent, mobileOptimized };
    })()
  `);
  return result;
}

function generateDeploymentCode(): LeadPageFindings["deploymentCode"] {
  const recaptcha = `<!-- reCAPTCHA v3 部署代码 -->
<script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
<script>
  grecaptcha.ready(function() {
    grecaptcha.execute('YOUR_SITE_KEY', {action: 'submit'}).then(function(token) {
      // 将 token 添加到表单隐藏字段
      document.getElementById('recaptcha-token').value = token;
    });
  });
</script>

<!-- 粘贴到表单内部，提交按钮之前 -->
<input type="hidden" id="recaptcha-token" name="recaptcha-token">

<!--
部署步骤：
1. 访问 https://www.google.com/recaptcha/admin 注册站点
2. 选择 reCAPTCHA v3，添加你的域名
3. 复制站点密钥 (Site Key) 替换上方 YOUR_SITE_KEY
4. 复制密钥 (Secret Key) 配置到后端验证
5. 在表单提交时验证 recaptcha-token
-->`;

  const turnstile = `<!-- Cloudflare Turnstile 部署代码 -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<!-- 粘贴到表单内部，提交按钮之前 -->
<div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY" data-callback="onTurnstileSuccess"></div>

<script>
  function onTurnstileSuccess(token) {
    // token 验证成功，可在此处启用提交按钮
    document.getElementById('submit-btn').disabled = false;
  }
</script>

<!--
部署步骤：
1. 访问 https://dash.cloudflare.com/ 进入 Turnstile
2. 创建新站点，添加你的域名
3. 复制站点密钥 (Site Key) 替换上方 YOUR_SITE_KEY
4. 在后端验证 token（调用 Cloudflare API）
5. 管理模式下可设置为 "Invisible" 无感验证
-->`;

  return { recaptcha, turnstile };
}

function getCuratedTutorials(): LeadPageFindings["tutorials"] {
  return [
    {
      title: "How to Add reCAPTCHA v3 to Your Website (Complete Tutorial)",
      url: "https://www.youtube.com/watch?v=em5NV9PW7pM",
      channel: "Google Developers",
      views: "1.8M",
    },
    {
      title: "Cloudflare Turnstile Setup Guide - Replace reCAPTCHA",
      url: "https://www.youtube.com/watch?v=5f-ltJj7NcE",
      channel: "Cloudflare",
      views: "650K",
    },
    {
      title: "Contact Form Security: reCAPTCHA vs Honeypot vs Turnstile",
      url: "https://www.youtube.com/watch?v=KFdF-u-vM20",
      channel: "Web Dev Simplified",
      views: "420K",
    },
  ];
}

function getIndustryTemplates(): LeadPageFindings["industryTemplates"] {
  return [
    {
      industry: "制造业 (Manufacturing)",
      fields: ["姓名", "邮箱", "公司名称", "职位", "产品需求", "采购数量", "联系电话"],
      tips: "突出产品规格和 MOQ 字段，增加客户询盘质量",
    },
    {
      industry: "SaaS / 软件",
      fields: ["姓名", "工作邮箱", "公司名称", "团队规模", "使用场景", "预算范围", "预约演示时间"],
      tips: "工作邮箱验证可过滤个人用户，团队规模帮助销售分级跟进",
    },
    {
      industry: "电商 / 零售",
      fields: ["姓名", "邮箱", "店铺名称", "主营品类", "月均订单量", "目标市场", "WhatsApp"],
      tips: "增加 WhatsApp 字段方便海外即时沟通，月均订单量判断客户规模",
    },
    {
      industry: "咨询服务",
      fields: ["姓名", "邮箱", "公司", "咨询类型", "预算区间", "期望时间", "项目简述"],
      tips: "预算区间帮助顾问快速判断服务层级，项目简述字段便于初筛",
    },
    {
      industry: "教育培训",
      fields: ["姓名", "邮箱", "机构名称", "学员规模", "课程需求", "目标地区", "联系时间偏好"],
      tips: "学员规模帮助推荐合适方案，联系时间偏好提升跟进成功率",
    },
  ];
}

function calculateInterceptionRate(security: SecurityPlugin): string {
  if (!security.detected) return "未安装防护，预计可拦截 0% 机器攻击";
  if (security.type === "recaptcha_v3") return "已安装 reCAPTCHA v3，预计可拦截 99.9% 机器攻击";
  if (security.type === "recaptcha_v2") return "已安装 reCAPTCHA v2，预计可拦截 99.5% 机器攻击";
  if (security.type === "cloudflare_turnstile") return "已安装 Cloudflare Turnstile，预计可拦截 99.8% 机器攻击";
  if (security.type === "honeypot") return "已安装 Honeypot，预计可拦截 60-70% 机器攻击";
  if (security.type === "hcaptcha") return "已安装 hCaptcha，预计可拦截 99.5% 机器攻击";
  if (security.type === "datadome") return "已安装 DataDome，预计可拦截 99.9% 机器攻击";
  return "未知防护类型";
}

// Check if form actions use HTTPS and basic CORS policy
async function checkFormSecurity(page: any, pageUrl: string): Promise<{ formActionHttps: boolean; hasCorsIssues: boolean }> {
  const result: any = await page.evaluate(`
    (() => {
      const forms = Array.from(document.querySelectorAll('form'));
      let insecureAction = false;
      let hasExternalAction = false;
      for (const form of forms) {
        const action = form.action || '';
        if (action && action.startsWith('http:')) {
          insecureAction = true;
        }
        if (action && action.startsWith('http') && !action.includes(location.hostname)) {
          hasExternalAction = true;
        }
      }
      return { insecureAction, hasExternalAction };
    })()
  `);
  return {
    formActionHttps: !result.insecureAction,
    hasCorsIssues: result.hasExternalAction,
  };
}

// ---- 主分析函数 ----

export async function analyzeLeadPage(pageId: string, url: string, page: Page): Promise<void> {
  const result = await prisma.diagnosticResult.findFirst({
    where: { pageId, module: "lead_page_check" },
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

    const [security, formsResult, thankYou, formSecurity, viewport] = await Promise.all([
      detectSecurityPlugins(page),
      analyzeForms(page),
      detectThankYou(page),
      checkFormSecurity(page, url),
      detectViewport(page),
    ]);

    const https = url.startsWith("https://");
    const deploymentCode = generateDeploymentCode();
    const tutorials = getCuratedTutorials();
    const industryTemplates = getIndustryTemplates();
    const interceptionRate = calculateInterceptionRate(security);

    const { analysis: forms, fields, ctaText } = formsResult;

    const formStructure: FormStructure = {
      fields: fields.slice(0, 20),
      totalFields: forms.totalFields,
      requiredCount: forms.requiredFields,
      ctaText,
      hasThankYouPage: thankYou.detected,
    };

    const score = Math.min(100,
      (security.detected ? 35 : 0) +
      Math.round(forms.score * 0.30) +
      (https ? 15 : 0) +
      (thankYou.detected ? 10 : 0) +
      (formSecurity.formActionHttps ? 5 : 0) +
      (!formSecurity.hasCorsIssues ? 5 : 0) +
      (viewport.mobileOptimized ? 5 : 0)
    );

    const findings: LeadPageFindings = {
      https,
      security,
      forms,
      formStructure,
      thankYouPage: thankYou,
      viewport,
      deploymentCode,
      tutorials,
      industryTemplates,
      interceptionRate,
    };

    const recommendations: string[] = [];
    if (!security.detected) {
      recommendations.push("紧急：部署 reCAPTCHA v3、Cloudflare Turnstile 或 hCaptcha 防止机器攻击");
    } else {
      recommendations.push(`当前防护: ${security.type}`);
    }
    if (forms.score < 60) recommendations.push("表单字段不够完整，建议参考行业模板优化");
    if (!thankYou.detected) recommendations.push("建议添加提交后的 Thank You 页面或成功提示");
    if (!https) recommendations.push("必须启用 HTTPS，否则表单数据可能被截获");
    if (!formSecurity.formActionHttps) recommendations.push("警告：检测到表单使用 HTTP 提交，存在数据泄露风险");
    if (formSecurity.hasCorsIssues) recommendations.push("注意：表单提交指向外部域名，请确认 CORS 配置正确");
    if (!viewport.viewportConfigured) recommendations.push("建议：添加 viewport meta 标签以支持移动端浏览");
    else if (!viewport.mobileOptimized) recommendations.push("建议：优化 viewport 配置（包含 width=device-width 和 initial-scale）");

    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        score,
        findings: findings as any,
        reportData: {
          summary: security.detected
            ? `已安装 ${security.type} 安全插件，${interceptionRate}`
            : `未安装任何安全插件，${interceptionRate}，建议立即部署 reCAPTCHA 或 Turnstile`,
          recommendations,
          deploymentCode,
          tutorials,
          industryTemplates,
          formSecurity,
        } as any,
      },
    });
  } catch (err) {
    console.error(`MOD-002 analysis error for page ${pageId}:`, err);
    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: { status: "failed" },
    });
  }
}
