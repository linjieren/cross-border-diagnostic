export interface TrustedSource {
  id: string;
  label: string;
  url: string;
  domains: string[];
  keywords: string[];
}

export const TRUSTED_SOURCES: TrustedSource[] = [
  {
    id: "cloudflare-turnstile",
    label: "Cloudflare Turnstile 官方文档",
    url: "https://developers.cloudflare.com/turnstile/get-started/",
    domains: ["developers.cloudflare.com", "cloudflare.com"],
    keywords: ["turnstile", "recaptcha", "hcaptcha", "captcha", "form security", "bot", "表单安全", "机器人", "验证码"],
  },
  {
    id: "cloudflare-dashboard",
    label: "Cloudflare 登录入口",
    url: "https://dash.cloudflare.com/",
    domains: ["dash.cloudflare.com"],
    keywords: ["cloudflare dashboard", "cloudflare login", "cloudflare 后台", "cloudflare 登录", "cloudflare 官网", "登录 cloudflare"],
  },
  {
    id: "cloudflare-cdn",
    label: "Cloudflare CDN 官方文档",
    url: "https://developers.cloudflare.com/cache/",
    domains: ["developers.cloudflare.com", "cloudflare.com"],
    keywords: ["cloudflare cdn", "cdn", "cache", "http/2", "http/3", "ttfb", "缓存", "全球加速", "访问速度"],
  },
  {
    id: "google-analytics-setup",
    label: "Google Analytics 4 Web 官方开发文档",
    url: "https://developers.google.com/analytics/devguides/collection/ga4/web",
    domains: ["support.google.com", "developers.google.com"],
    keywords: ["ga4", "google analytics", "analytics", "measurement id", "数据分析", "网站分析"],
  },
  {
    id: "google-tag-manager-ga4",
    label: "Google Tag Manager 设置 GA4 官方指南",
    url: "https://support.google.com/tagmanager/answer/9442095",
    domains: ["support.google.com", "tagmanager.google.com"],
    keywords: ["gtm", "google tag manager", "tag manager", "container", "标签管理", "容器"],
  },
  {
    id: "google-ads-conversions",
    label: "Google Ads 转化跟踪官方指南",
    url: "https://support.google.com/google-ads/answer/9119707",
    domains: ["support.google.com", "ads.google.com", "developers.google.com"],
    keywords: ["google ads", "conversion tracking", "enhanced conversions", "转化跟踪", "广告转化"],
  },
  {
    id: "meta-pixel",
    label: "Meta Pixel 官方帮助",
    url: "https://www.facebook.com/business/help/952192354843755",
    domains: ["facebook.com", "business.facebook.com", "developers.facebook.com", "meta.com"],
    keywords: ["meta pixel", "facebook pixel", "meta events", "facebook ads", "pixel", "像素"],
  },
  {
    id: "linkedin-insight-tag",
    label: "LinkedIn Insight Tag 官方帮助",
    url: "https://www.linkedin.com/help/lms/answer/a489169",
    domains: ["linkedin.com"],
    keywords: ["linkedin insight", "insight tag", "linkedin ads", "linkedin", "领英"],
  },
  {
    id: "tiktok-pixel",
    label: "TikTok Pixel 官方帮助",
    url: "https://ads.tiktok.com/help/article/get-started-pixel",
    domains: ["ads.tiktok.com", "business.tiktok.com", "tiktok.com"],
    keywords: ["tiktok pixel", "tiktok ads", "tiktok", "pixel helper", "抖音", "tiktok 像素"],
  },
  {
    id: "microsoft-clarity",
    label: "Microsoft Clarity 官方文档",
    url: "https://learn.microsoft.com/clarity/",
    domains: ["learn.microsoft.com", "clarity.microsoft.com"],
    keywords: ["microsoft clarity", "clarity", "heatmap", "session recording", "热力图", "录屏"],
  },
  {
    id: "fcc-equipment-authorization",
    label: "FCC 设备认证官方说明",
    url: "https://www.fcc.gov/oet/ea",
    domains: ["fcc.gov"],
    keywords: ["fcc", "fcc certification", "equipment authorization", "compliance", "认证", "合规认证"],
  },
  {
    id: "eu-ce-marking",
    label: "欧盟 CE Marking 官方说明",
    url: "https://single-market-economy.ec.europa.eu/single-market/ce-marking_en",
    domains: ["europa.eu"],
    keywords: ["ce", "ce marking", "europe compliance", "欧盟", "ce 认证"],
  },
  {
    id: "shopify-contact-forms",
    label: "Shopify 表单设置官方帮助",
    url: "https://help.shopify.com/en/manual/online-store/themes/customizing-themes/add-contact-form",
    domains: ["help.shopify.com", "shopify.com"],
    keywords: ["shopify", "contact form", "online store", "shopify form", "联系表单"],
  },
];

const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE = /(?<!\]\()https?:\/\/[^\s<>)]+/g;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isHostAllowed(host: string, domains: string[]): boolean {
  const normalized = normalizeHost(host);
  return domains.some((domain) => {
    const expected = normalizeHost(domain);
    return normalized === expected || normalized.endsWith(`.${expected}`);
  });
}

function trustedSourceForUrl(href: string): TrustedSource | undefined {
  const url = parseHttpUrl(href);
  if (!url) return undefined;
  return TRUSTED_SOURCES.find((source) => isHostAllowed(url.hostname, source.domains));
}

function trustedSourceForText(text: string): TrustedSource | undefined {
  const haystack = text.toLowerCase();
  let best: { source: TrustedSource; score: number } | undefined;

  for (const source of TRUSTED_SOURCES) {
    const score = source.keywords.reduce((sum, keyword) => {
      return haystack.includes(keyword.toLowerCase()) ? sum + 1 : sum;
    }, 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { source, score };
    }
  }

  return best?.source;
}

function markdownLink(label: string, href: string): string {
  return `[${label}](${href})`;
}

async function isReachable(href: string): Promise<boolean> {
  const url = parseHttpUrl(href);
  if (!url) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const head = await fetch(href, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "CrossBorderDiagnosticBot/1.0" },
    });

    if (head.status >= 200 && head.status < 400) return true;
    if (![403, 405, 429].includes(head.status)) return false;

    const get = await fetch(href, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "CrossBorderDiagnosticBot/1.0" },
    });
    return get.status >= 200 && get.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanMarkdownLink(label: string, href: string): Promise<string> {
  const sourceFromUrl = trustedSourceForUrl(href);
  const sourceFromText = trustedSourceForText(`${label} ${href}`);

  if (sourceFromUrl) {
    const reachable = await isReachable(href);
    if (reachable) return markdownLink(label, href);
    if (sourceFromText) return markdownLink(sourceFromText.label, sourceFromText.url);
    return sourceFromUrl ? markdownLink(sourceFromUrl.label, sourceFromUrl.url) : `${label}（链接需复核）`;
  }

  if (sourceFromText) {
    return markdownLink(sourceFromText.label, sourceFromText.url);
  }

  return `${label}（未校验链接已隐藏）`;
}

export function buildTrustedSourcesPrompt(): string {
  const lines = TRUSTED_SOURCES.map((source) => `- ${source.label}: ${source.url}`);
  return `\n\nTrusted source rules:\n- Use only the official links below for external references.\n- Do not invent URLs, document paths, icon download pages, or help center pages.\n- If none of these sources fits, mention the platform name without a link and say it needs manual verification.\n- Never claim that a logo, badge, or certification icon can be downloaded from an official site unless the official source below explicitly supports that claim.\n\nOfficial source allowlist:\n${lines.join("\n")}`;
}

export async function sanitizeTrustedLinks(markdown: string): Promise<string> {
  const replacements: Array<Promise<{ original: string; replacement: string }>> = [];

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const [original, label, href] = match;
    replacements.push(
      cleanMarkdownLink(label, href).then((replacement) => ({ original, replacement }))
    );
  }

  let cleaned = markdown;
  for (const { original, replacement } of await Promise.all(replacements)) {
    cleaned = cleaned.replace(original, replacement);
  }

  cleaned = cleaned.replace(BARE_URL_RE, (href) => {
    const source = trustedSourceForUrl(href) || trustedSourceForText(href);
    if (source) return markdownLink(source.label, source.url);
    return "未校验链接已隐藏";
  });

  cleaned = cleaned.replace(
    /图标可以从\s+(\[[^\]]+\]\([^)]+\)|https?:\/\/\S+|[^，。\n]+)\s+下载官方样式[。.]?/g,
    "可以参考 $1 核对认证要求；页面上的认证标识样式建议以实际证书、检测报告或合规顾问确认为准。"
  );

  return cleaned;
}
