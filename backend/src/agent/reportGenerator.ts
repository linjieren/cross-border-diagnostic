import { callDeepSeek, DeepSeekMessage } from "./deepseek";
import MarkdownIt from "markdown-it";

function removeInlineCode(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/`([^`\n]+)`/g, '$1');
  }).join('');
}

function normalizeComputedScores(markdown: string): string {
  const moduleScoreMatches = [...markdown.matchAll(/^###\s+.+?\n\n\*\*评分\*\*[：:]\s*(\d{1,3})\/100/gm)];
  const moduleScores = moduleScoreMatches
    .map((match) => Number.parseInt(match[1] || "", 10))
    .filter((score) => Number.isFinite(score));

  if (moduleScores.length !== 4) {
    return markdown;
  }

  const totalScore = Math.round(moduleScores.reduce((sum, score) => sum + score, 0) / moduleScores.length);
  let next = markdown;

  next = next.replace(
    /(诊断日期[^\n]*综合评分[：:]\s*)\d+\/100/,
    `$1${totalScore}/100`,
  );

  next = next.replace(
    /(\*\*综合评分[：:])\s*\d+\/100(\*\*)/,
    `$1 ${totalScore}/100$2`,
  );

  next = next.replace(
    /(\*\*综合评分[：:]\s*)\d+(?:\.\d+)?\/100(\*\*)/,
    `$1${totalScore}/100$2`,
  );

  next = next.replace(
    /(\|\s*总计\s*\|\s*100\s*\|\s*-+\s*\|\s*)[\d.]+(\s*\|)/,
    `$1${totalScore}$2`,
  );

  return next;
}

function targetMarketLabel(targetMarket: string): string {
  const labels: Record<string, string> = {
    us: "美国",
    eu: "欧洲",
    uk: "英国",
    jp: "日本",
    kr: "韩国",
    sea: "东南亚",
    au: "澳大利亚",
    ca: "加拿大",
    br: "巴西",
    mx: "墨西哥",
    in: "印度",
    mea: "中东/非洲",
  };
  return labels[targetMarket.toLowerCase()] || targetMarket;
}

function normalizeHeadingSpacing(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part
      .replace(/([^\n#])\s*(#{2,4}\s+)/g, "$1\n\n$2")
      .replace(/\n{3,}/g, "\n\n");
  }).join("");
}

function computedOverallScore(toolResults: any[]): number {
  const modules = Array.isArray(toolResults) ? toolResults : [];
  const scores = modules.map(moduleScore);
  if (!scores.length) return 60;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function buildScoreBreakdownSection(toolResults: any[]): string {
  const modules = Array.isArray(toolResults) ? toolResults : [];
  const rows = modules.map((result) => {
    const score = moduleScore(result);
    return `| ${moduleTitle(result?.module)} | 25 | ${score} | ${Number((score * 0.25).toFixed(2))} |`;
  });
  const overall = computedOverallScore(toolResults);

  return `## 评分分解表

| 评估模块 | 权重 | 得分 | 加权得分 |
|---|---:|---:|---:|
${rows.join("\n") || "| 暂无模块 | 100 | 60 | 60 |"}
| 总计 | 100 | - | ${overall} |`;
}

function replaceH2Section(markdown: string, headingPattern: RegExp, replacement: string): string {
  const match = headingPattern.exec(markdown);
  if (!match || typeof match.index !== "number") return `${markdown.trim()}\n\n${replacement}`;

  const start = match.index;
  const nextMatch = /^##\s+.+$/gm.exec(markdown.slice(start + match[0].length));
  if (!nextMatch || typeof nextMatch.index !== "number") {
    return `${markdown.slice(0, start).trimEnd()}\n\n${replacement}`;
  }

  const end = start + match[0].length + nextMatch.index;
  return `${markdown.slice(0, start).trimEnd()}\n\n${replacement}\n\n${markdown.slice(end).trimStart()}`;
}

function findNextH2SectionEnd(markdown: string, sectionStart: number): number {
  const lineEnd = markdown.indexOf("\n", sectionStart);
  const contentStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
  const nextMatch = /^##\s+.+$/gm.exec(markdown.slice(contentStart));
  return nextMatch ? contentStart + nextMatch.index : markdown.length;
}

function normalizeScoreBreakdown(markdown: string, toolResults: any[]): string {
  const headingPattern = /^##\s+(评分拆解|评分拆解表|评分分解|评分分解表|Score Breakdown Table|Score Breakdown).*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  const replacement = buildScoreBreakdownSection(toolResults);

  if (!matches.length) {
    const verdictMatch = /^##\s+(综合评分与结论|总体评分与结论|Overall Score & Verdict|Overall Score|Verdict).*$/m.exec(markdown);
    if (!verdictMatch || typeof verdictMatch.index !== "number") {
      return `${markdown.trim()}\n\n${replacement}`;
    }
    return `${markdown.slice(0, verdictMatch.index).trimEnd()}\n\n${replacement}\n\n${markdown.slice(verdictMatch.index).trimStart()}`;
  }

  let next = "";
  let cursor = 0;

  matches.forEach((match, index) => {
    const start = match.index || 0;
    const end = findNextH2SectionEnd(markdown, start);
    next += markdown.slice(cursor, start).trimEnd();
    if (index === 0) {
      next += `${next.trim() ? "\n\n" : ""}${replacement}\n\n`;
    }
    cursor = end;
  });

  next += markdown.slice(cursor).trimStart();
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeMetaLine(
  markdown: string,
  dateString: string,
  targetMarket: string,
  understanding: any,
  toolResults: any[],
): string {
  const productType = understanding?.productType || "待确认";
  const overall = computedOverallScore(toolResults);
  const metaLine = `诊断日期：${dateString} / 目标市场：${targetMarketLabel(targetMarket)} / 产品类型：${productType} / 综合评分：${overall}/100`;
  const metaPattern = /^诊断日期[^\n]*目标市场[^\n]*产品类型[^\n]*综合评分[^\n]*$/m;

  const withMeta = metaPattern.test(markdown)
    ? markdown.replace(metaPattern, metaLine)
    : markdown.replace(/^(#\s+.+)$/m, `$1\n\n${metaLine}`);

  const firstSectionIndex = withMeta.search(/^##\s+/m);
  if (firstSectionIndex === -1) return withMeta;

  const opening = withMeta.slice(0, firstSectionIndex);
  const rest = withMeta.slice(firstSectionIndex);
  const cleanedOpening = opening
    .replace(/^\*\*(诊断日期|目标市场|产品类型|综合评分)\*\*\s*[:：][^\n]*(?:\n|$)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return `${cleanedOpening}\n\n${rest.trimStart()}`;
}

function toBrandName(value: string): string {
  const cleaned = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
  const rawName = (cleaned.includes(".") ? cleaned.split(".")[0] : cleaned) || cleaned;
  return rawName
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeReportTitle(markdown: string, reportTitle: string): string {
  if (/^#\s+.+/m.test(markdown)) {
    return markdown.replace(/^#\s+.+$/m, `# ${reportTitle}`);
  }
  return `# ${reportTitle}\n\n${markdown.trim()}`;
}

function isMissingDeepSeekApiKey(err: unknown): boolean {
  return err instanceof Error && err.message.includes("DEEPSEEK_API_KEY is not configured");
}

function statusText(status?: string): string {
  if (status === "pass") return "通过";
  if (status === "fail") return "未通过";
  if (status === "warn") return "需优化";
  return "待确认";
}

const CANONICAL_MODULES = [
  { id: "global_acceleration", title: "访问与加载体验" },
  { id: "lead_page_check", title: "落地页转化诊断" },
  { id: "product_content_audit", title: "产品与合规内容诊断" },
  { id: "form_tracking", title: "线索与表单追踪诊断" },
] as const;

function moduleTitle(module?: string): string {
  const match = CANONICAL_MODULES.find((item) => item.id === module);
  if (match) return match.title;
  return module || "诊断模块";
}

function moduleScore(result: any): number {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  if (result?.error) return 45;
  if (!findings.length) return 60;

  const total = findings.reduce((sum: number, finding: any) => {
    if (finding?.status === "pass") return sum + 100;
    if (finding?.status === "warn") return sum + 65;
    if (finding?.status === "fail") return sum + 35;
    return sum + 55;
  }, 0);
  return Math.round(total / findings.length);
}

function businessLens(module?: string): string {
  if (module === "global_acceleration") {
    return "重点解释跨境首屏速度、广告落地页跳出率、移动端加载体验和海外访问稳定性。";
  }
  if (module === "lead_page_check") {
    return "重点解释询盘信任、表单安全、提交成功反馈、垃圾线索防护和B2B留资摩擦。";
  }
  if (module === "product_content_audit") {
    return "重点解释B2B采购决策所需的信息完整度，包括认证、参数、案例、FAQ、价格和视频证明。";
  }
  if (module === "form_tracking") {
    return "重点解释广告归因、GA4事件、像素转化、线索质量复盘和Cookie合规。";
  }
  return "重点解释该模块对信任、转化和后续运营判断的影响。";
}

function actionLens(module?: string): string {
  if (module === "global_acceleration") {
    return "优先给出CDN、HTTP/2或HTTP/3、图片格式、缓存和关键资源加载顺序的修复动作。";
  }
  if (module === "lead_page_check") {
    return "优先给出表单防护、字段精简、成功页、信任元素和移动端留资路径的修复动作。";
  }
  if (module === "product_content_audit") {
    return "优先给出认证展示、客户案例、技术参数表、FAQ、定价说明和产品视频的内容补齐动作。";
  }
  if (module === "form_tracking") {
    return "优先给出GTM、GA4、广告像素、转化事件、UTM规范和Cookie同意的配置动作。";
  }
  return "优先给出可在页面或配置中直接执行的修复动作。";
}

function hasFinding(result: any, checks: string[], statuses: string[] = ["fail", "warn"]): boolean {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  return findings.some((finding: any) => {
    const check = String(finding?.check || "");
    return checks.some((keyword) => check.includes(keyword)) && statuses.includes(finding?.status);
  });
}

function supplementalMaterials(result: any) {
  const module = result?.module;

  if (module === "global_acceleration" && hasFinding(result, ["CDN", "HTTP", "缓存", "图片", "首字节"])) {
    return {
      codeBlocks: [
        {
          label: "Cloudflare CDN 基础部署",
          language: "html",
          code: `<!-- Cloudflare CDN 部署代码 -->
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
5. 在 SSL/TLS 选项卡中启用 Full 加密模式
6. 在 Speed 选项卡中启用 Auto Minify (JS/CSS/HTML)
-->`,
        },
      ],
      resources: [
        { title: "Cloudflare CDN setup tutorial", url: "https://www.youtube.com/results?search_query=Cloudflare+CDN+setup+tutorial" },
        { title: "Cloudflare cache rules documentation", url: "https://developers.cloudflare.com/cache/how-to/cache-rules/" },
        { title: "HTTP/2 and HTTP/3 website optimization", url: "https://www.youtube.com/results?search_query=HTTP%2F2+HTTP%2F3+website+optimization" },
      ],
    };
  }

  if (module === "lead_page_check" && hasFinding(result, ["表单安全", "表单字段", "Thank You", "移动端", "HTTPS"])) {
    return {
      codeBlocks: [
        {
          label: "Cloudflare Turnstile 表单防护",
          language: "html",
          code: `<!-- Cloudflare Turnstile 部署代码 -->
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
5. 管理模式下可设置为 Invisible 无感验证
-->`,
        },
      ],
      resources: [
        { title: "Cloudflare Turnstile setup guide", url: "https://developers.cloudflare.com/turnstile/get-started/" },
        { title: "Cloudflare Turnstile website tutorial", url: "https://www.youtube.com/results?search_query=Cloudflare+Turnstile+website+setup" },
        { title: "reCAPTCHA v3 form setup tutorial", url: "https://www.youtube.com/results?search_query=reCAPTCHA+v3+form+setup+tutorial" },
      ],
    };
  }

  if (module === "product_content_audit" && hasFinding(result, ["合规", "客户", "技术参数", "工作原理", "FAQ", "定价", "产品视频", "内容矩阵"])) {
    return {
      codeBlocks: [
        {
          label: "产品详情页内容缺失检测",
          language: "html",
          code: `<!-- 产品详情页增强模块 — 一键嵌入 -->
<!-- 将以下代码粘贴到现有产品详情页的 </body> 标签之前 -->

<script>
(function() {
  // 内容缺失检测与高亮
  const checks = [
    { selector: 'table', label: '技术参数表', importance: 'high' },
    { selector: 'blockquote, .testimonial', label: '客户评价', importance: 'high' },
    { selector: 'img[src*="cert"], .certification', label: '合规认证', importance: 'high' },
    { selector: 'video, .how-it-works', label: '工作原理', importance: 'medium' },
  ];

  const missing = checks.filter(c => !document.querySelector(c.selector));
  if (missing.length > 0) {
    console.warn('[产品页诊断] 缺失模块:', missing.map(m => m.label).join(', '));
  }
})();
</script>

<!--
部署步骤：
1. 复制上方 <script> 到产品详情页底部
2. 打开浏览器控制台查看缺失模块提示
3. 按提示补充对应内容区块
4. 建议配合 A/B 测试验证补充后的转化率变化
-->`,
        },
      ],
      resources: [
        { title: "B2B Product Page Best Practices", url: "https://www.youtube.com/results?search_query=B2B+product+page+best+practices" },
        { title: "How to Write B2B Case Studies", url: "https://www.youtube.com/results?search_query=how+to+write+B2B+case+studies" },
      ],
    };
  }

  if (module === "form_tracking" && hasFinding(result, ["GA4", "Meta", "GTM", "表单转化", "LinkedIn", "TikTok", "行为分析", "Cookie", "UTM"])) {
    return {
      codeBlocks: [
        {
          label: "GA4 表单转化追踪",
          language: "html",
          code: `<!-- GA4 表单转化追踪代码 — 粘贴到 Thank You 页面 -->
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
-->`,
        },
        {
          label: "Meta Pixel Lead 事件",
          language: "html",
          code: `<!-- Meta Pixel Lead 事件代码 — 粘贴到 Thank You 页面 -->
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
-->`,
        },
      ],
      resources: [
        { title: "GA4 Generate Lead Event Setup", url: "https://www.youtube.com/results?search_query=GA4+generate_lead+event+setup" },
        { title: "Meta Pixel Lead Event Setup", url: "https://www.youtube.com/results?search_query=Meta+Pixel+Lead+event+setup" },
        { title: "Google Tag Manager Form Tracking", url: "https://www.youtube.com/results?search_query=Google+Tag+Manager+form+tracking" },
      ],
    };
  }

  return { codeBlocks: [], resources: [] };
}

function buildSupplementalMarkdown(result: any): string {
  const materials = supplementalMaterials(result);
  const blocks: string[] = [];

  if (materials.codeBlocks.length) {
    const codeBlocks = materials.codeBlocks.map((block) => {
      return `**${block.label}**

\`\`\`${block.language}
${block.code}
\`\`\``;
    });
    blocks.push(`#### 参考代码

${codeBlocks.join("\n\n")}`);
  }

  if (materials.resources.length) {
    const resources = materials.resources
      .map((resource) => `- [${resource.title}](${resource.url})`)
      .join("\n");
    blocks.push(`#### 参考资料

${resources}`);
  }

  return blocks.join("\n\n");
}

function stripH4Sections(markdown: string, headings: string[]): string {
  let next = markdown;
  for (const heading of headings) {
    const pattern = new RegExp(`^####\\s+${heading}\\s*\\n[\\s\\S]*?(?=^####\\s+|^###\\s+|^##\\s+|(?![\\s\\S]))`, "gm");
    next = next.replace(pattern, "");
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function ensureSupplementalSections(markdown: string, toolResults: any[]): string {
  let next = markdown;
  const modules = Array.isArray(toolResults) ? toolResults : [];

  for (const result of modules) {
    const supplement = buildSupplementalMarkdown(result);
    if (!supplement) continue;

    const title = moduleTitle(result?.module);
    const sectionPattern = new RegExp(`^###\\s+${title}\\s*\\n[\\s\\S]*?(?=^###\\s+|^##\\s+|(?![\\s\\S]))`, "m");
    next = next.replace(sectionPattern, (section) => {
      const cleanedSection = stripH4Sections(section, ["参考代码", "参考资料"]);
      if (/^####\s+验证方式/m.test(cleanedSection)) {
        return cleanedSection.replace(/^####\s+验证方式/m, `${supplement}\n\n#### 验证方式`);
      }
      if (/^####\s+工时估算/m.test(cleanedSection)) {
        return cleanedSection.replace(/^####\s+工时估算/m, `${supplement}\n\n#### 工时估算`);
      }
      return `${cleanedSection}\n\n${supplement}`;
    });
  }

  return next.replace(/\n{3,}/g, "\n\n");
}

function normalizedFinding(finding: any) {
  return {
    check: finding?.check || "检测项",
    status: finding?.status || "unknown",
    statusLabel: statusText(finding?.status),
    detail: finding?.detail || "暂无详情",
    evidence: finding?.evidence || null,
  };
}

function splitFindings(result: any) {
  const findings = Array.isArray(result?.findings) ? result.findings.map(normalizedFinding) : [];
  return {
    strengths: findings.filter((finding: any) => finding.status === "pass"),
    gaps: findings.filter((finding: any) => finding.status === "fail"),
    optimizations: findings.filter((finding: any) => finding.status === "warn"),
    unknowns: findings.filter((finding: any) => !["pass", "fail", "warn"].includes(finding.status)),
    all: findings,
  };
}

function buildModuleDigest(toolResults: any[]) {
  const modules = Array.isArray(toolResults) ? toolResults : [];
  return modules.map((result) => {
    const split = splitFindings(result);
    return {
      module: result?.module || "unknown",
      title: moduleTitle(result?.module),
      score: moduleScore(result),
      businessLens: businessLens(result?.module),
      actionLens: actionLens(result?.module),
      strengths: split.strengths,
      gaps: split.gaps,
      optimizations: split.optimizations,
      unknowns: split.unknowns,
      counts: {
        pass: split.strengths.length,
        fail: split.gaps.length,
        warn: split.optimizations.length,
        unknown: split.unknowns.length,
        total: split.all.length,
      },
      rawError: result?.error || null,
    };
  });
}

function findingLines(result: any): string[] {
  if (result?.error) {
    return [`- **自动检查**: 待确认。${result.error}`];
  }

  const findings = Array.isArray(result?.findings) ? result.findings : [];
  if (!findings.length) {
    return ["- **自动检查**: 待确认。当前模块没有返回可展示的检查项。"];
  }

  return findings.slice(0, 8).map((finding: any) => {
    const check = finding?.check || "检测项";
    const detail = finding?.detail || "暂无详情";
    return `- **${check}**: ${statusText(finding?.status)}。${detail}`;
  });
}

function fallbackModuleSection(result: any): string {
  const title = moduleTitle(result?.module);
  const score = moduleScore(result);
  const findingText = findingLines(result).join("\n");

  return `### ${title}

**评分**: ${score}/100

#### 关键发现

${findingText}

#### 影响分析

该模块结果来自自动化规则检查。它可以帮助快速定位明显问题，但不等同于完整的人工顾问判断。

#### 修复建议

1. 优先处理状态为未通过的检查项。
2. 对状态为需优化的项目补充证据、配置或页面内容。
3. 修改后重新运行诊断，确认检查状态是否改善。

#### 验证方式

- 重新提交同一网站 URL 发起诊断。
- 对照本模块关键发现，确认未通过项是否减少。

#### 预期结果

基础问题修复后，页面可信度、访问稳定性和投放数据可用性会更容易进入可优化状态。

#### 工时估算

半天`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resultForModule(toolResults: any[], moduleId: string) {
  const modules = Array.isArray(toolResults) ? toolResults : [];
  return modules.find((result) => result?.module === moduleId) || { module: moduleId, findings: [] };
}

function findingImpact(module: string | undefined, finding: any): string {
  const check = String(finding?.check || "");

  if (module === "global_acceleration") {
    if (check.includes("CDN")) return "对海外用户来说，这会直接影响首屏等待时间和广告点击后的承接稳定性。";
    if (check.includes("HTTP")) return "协议能力不足会降低并发资源加载效率，移动端和跨境网络下体感更明显。";
    if (check.includes("图片")) return "图片体积和格式会影响首屏速度，尤其是产品图较多的企业站。";
    if (check.includes("缓存")) return "缺少缓存策略会让重复访问和多页面浏览都重新消耗加载时间。";
    if (check.includes("TTFB") || check.includes("首字节")) return "首字节时间会影响搜索引擎和买家对网站响应速度的第一印象。";
  }

  if (module === "lead_page_check") {
    if (check.includes("表单安全")) return "缺少防护会增加垃圾线索和自动提交风险，也会拉低销售团队处理效率。";
    if (check.includes("表单字段")) return "字段不完整或路径不清晰会让真实买家难以表达采购需求，线索质量也更难判断。";
    if (check.includes("Thank You")) return "没有成功反馈会让用户不确定表单是否提交成功，也会影响转化事件触发。";
    if (check.includes("移动端")) return "移动端适配直接影响广告流量和海外访客的留资体验。";
    if (check.includes("HTTPS")) return "安全连接是海外买家提交公司信息和联系方式的基本信任前提。";
  }

  if (module === "product_content_audit") {
    if (check.includes("合规")) return "认证缺失会让B2B买家无法判断产品是否满足目标市场准入和采购规范。";
    if (check.includes("客户")) return "缺少客户背书会削弱社会信任，采购方更难相信交付能力。";
    if (check.includes("技术参数")) return "参数不足会阻碍工程、采购和渠道伙伴进行横向比较。";
    if (check.includes("FAQ")) return "FAQ缺失会把交期、MOQ、售后等高频问题推给人工客服。";
    if (check.includes("定价")) return "缺少价格或询价说明会增加早期评估成本，部分买家会直接流失。";
    if (check.includes("视频") || check.includes("工作原理")) return "演示内容能帮助买家快速理解产品形态、使用方式和差异化能力。";
    if (check.includes("内容矩阵")) return "内容深度不足会影响搜索覆盖、再营销素材和销售跟进资料。";
  }

  if (module === "form_tracking") {
    if (check.includes("GA4")) return "没有基础分析会让团队无法判断访问、互动和线索生成之间的关系。";
    if (check.includes("Meta") || check.includes("LinkedIn") || check.includes("TikTok")) return "广告像素缺失会影响投放平台学习和再营销受众积累。";
    if (check.includes("GTM")) return "缺少统一标签管理会让后续追踪迭代依赖开发排期，配置成本更高。";
    if (check.includes("表单转化")) return "没有转化事件就无法衡量询盘成本，也无法判断渠道质量。";
    if (check.includes("Cookie")) return "合规提示不足会增加欧美市场的数据合规风险。";
    if (check.includes("UTM")) return "来源参数不规范会让渠道复盘和销售归因变得模糊。";
  }

  return "这会影响用户信任、转化判断或后续运营复盘，需要在下一轮优化中明确处理。";
}

function detailedFindingLines(result: any, type: "strengths" | "risks"): string {
  const split = splitFindings(result);
  const module = result?.module;
  const source = type === "strengths"
    ? split.strengths.slice(0, 4)
    : [...split.gaps, ...split.optimizations].slice(0, 6);

  if (!source.length && type === "strengths") {
    return "- 当前未检测到足以作为优势的自动化检查项，建议先把本模块作为修复重点。";
  }

  if (!source.length) {
    return "- 当前未检测到明显缺口，但仍建议结合真实用户路径和广告数据进行复核。";
  }

  return source.map((finding: any) => {
    return `- **${finding.check}**: ${finding.statusLabel}。${finding.detail} ${findingImpact(module, finding)}`;
  }).join("\n");
}

function moduleImpactAnalysis(result: any): string {
  const score = moduleScore(result);
  const split = splitFindings(result);
  const module = result?.module;
  const issueSummary = `本模块得分为 ${score}/100，自动检查中有 ${split.gaps.length} 个未通过项、${split.optimizations.length} 个需优化项。`;

  if (module === "global_acceleration") {
    return `${issueSummary} 对跨境网站来说，速度问题会优先影响广告落地页承接和自然流量体验：买家从美国访问时，如果首屏慢、资源加载不稳定，询盘前的跳出概率会明显升高。\n\n从技术侧看，CDN、协议、缓存和图片格式是最容易放大跨境延迟的环节。即使网站内容本身完整，只要网络层没有做好，用户可能还没看到核心卖点就已经离开。`;
  }

  if (module === "lead_page_check") {
    return `${issueSummary} 留资页决定了买家从“感兴趣”走向“愿意联系”的最后一步。表单安全、字段结构和提交反馈不清晰，会降低有效询盘量，也会让销售团队收到更多低质量或不可追踪的线索。\n\n运营侧的核心问题是路径闭环不完整：用户提交前缺少信任保证，提交后缺少确认反馈，后台也很难判断这条线索来自哪个页面或广告来源。`;
  }

  if (module === "product_content_audit") {
    return `${issueSummary} B2B采购不是冲动决策，买家需要认证、参数、案例、FAQ和使用场景来判断供应商是否可靠。内容缺口越多，采购方越难在内部评审中推进，也更容易把网站放入“稍后再看”。\n\n内容侧的关键不是堆文案，而是把采购决策所需证据显性化：哪些市场能卖、产品参数是什么、谁用过、交付风险如何降低、常见疑问在哪里被回答。`;
  }

  if (module === "form_tracking") {
    return `${issueSummary} 追踪体系不足会让投放和询盘优化失去依据。即使网站产生了线索，团队也难以知道哪个渠道、关键词、页面或表单环节真正贡献了转化。\n\n技术侧需要把 GA4、GTM、广告像素、UTM 和 Cookie 合规串成一个闭环。否则后续优化只能凭感觉，很难持续降低获客成本或提升线索质量。`;
  }

  return `${issueSummary} 该模块会影响网站的基础可信度、转化路径和后续优化判断。\n\n建议把自动化结果作为第一轮排查清单，再结合真实访问数据和销售反馈进一步验证。`;
}

function moduleActions(module?: string): string[] {
  if (module === "global_acceleration") {
    return [
      "在 DNS 或托管平台层接入 Cloudflare、Fastly 或同类 CDN，并确认美国节点访问时静态资源从边缘节点返回。",
      "在服务器或托管平台配置 HTTP/2 或 HTTP/3，让图片、脚本和样式资源可以更高效并发加载。",
      "在图片上传或构建流程中输出 WebP/AVIF 版本，并为首屏大图设置合理压缩质量和尺寸。",
      "为图片、字体、脚本和样式配置 Cache-Control，确保二次访问不重复下载稳定资源。",
      "用 PageSpeed Insights 或 WebPageTest 选择美国节点复测，把 LCP、TTFB 和总加载时间记录为上线验收指标。",
    ];
  }

  if (module === "lead_page_check") {
    return [
      "在询盘表单中接入 Cloudflare Turnstile 或 reCAPTCHA，并在后端验证 token，完成后垃圾提交应明显减少。",
      "把核心表单字段收敛为姓名、邮箱、电话、公司、需求描述，并在需求描述中提示产品型号、数量和目标市场。",
      "新增独立 Thank You 页面或提交成功状态，明确告诉用户已收到询盘，并提示预计回复时间。",
      "在表单附近补充认证、服务区域、交付能力、隐私承诺或客户案例入口，让买家提交前能快速建立信任。",
      "用手机视口检查首页、产品页和联系页的 CTA，确保按钮、表单和联系方式在首屏或关键段落后可见。",
    ];
  }

  if (module === "product_content_audit") {
    return [
      "在核心产品页首屏明确写出产品定位、适用行业、目标用户和关键差异点，避免只展示品牌或泛泛介绍。",
      "为重点产品补充参数表，至少包含尺寸、重量、接口、功耗、防护等级、认证、工作温度和可定制项。",
      "把 CE、FCC、RoHS、ISO 等认证或测试报告放在产品页或下载中心，并提供证书扫描件或可验证编号。",
      "整理 3-5 个客户案例，按行业、应用场景、客户问题、解决方案和效果数据组织内容。",
      "新增 FAQ 区块，覆盖交期、MOQ、定制流程、售后、样品、付款和目标市场合规问题。",
      "为复杂产品增加工作原理图、短视频或场景图，让非技术采购也能快速理解产品价值。",
    ];
  }

  if (module === "form_tracking") {
    return [
      "在全站部署 GTM，把 GA4、广告像素和后续事件都放入统一标签管理容器，减少每次改动对开发的依赖。",
      "在 GA4 中配置 generate_lead 或 form_submit 事件，并在 Thank You 页面或表单成功回调中触发。",
      "为 Meta、LinkedIn 或重点广告平台配置 Lead 事件，让广告系统能学习真实询盘，而不是只优化点击。",
      "制定 UTM 命名规范，要求所有广告、EDM、社媒和销售链接都带 source、medium、campaign。",
      "增加 Cookie 同意横幅和隐私政策入口，面向欧美市场时明确说明分析和广告追踪用途。",
      "在表单中写入隐藏字段保存落地页、UTM、referrer 和提交页面，方便 CRM 或销售团队复盘线索来源。",
    ];
  }

  return [
    "优先处理未通过项，并记录修改前后的状态。",
    "补充缺失内容或配置后，重新运行同一 URL 的诊断。",
    "把修复结果同步给市场、销售和网站负责人，确保后续持续维护。",
  ];
}

function moduleVerification(module?: string): string[] {
  if (module === "global_acceleration") {
    return [
      "用 WebPageTest 选择美国节点测试首页和重点产品页，确认 TTFB、LCP 和总加载时间改善。",
      "在浏览器 Network 面板检查静态资源响应头，确认存在 CDN、缓存或压缩相关配置。",
      "用 PageSpeed Insights 复测移动端分数，重点观察图片、缓存和阻塞资源建议是否减少。",
      "从目标市场网络环境打开网站，确认首屏图片和导航不再长时间空白。",
    ];
  }

  if (module === "lead_page_check") {
    return [
      "提交一次测试询盘，确认用户能看到成功反馈或进入 Thank You 页面。",
      "用无效邮箱、空字段和重复提交测试表单校验，确认异常输入不会直接进入线索池。",
      "在移动端完成一次从首页到表单提交的路径，确认按钮、输入框和提示文字不被遮挡。",
      "查看后台或邮箱通知，确认每条测试线索都包含完整联系方式和需求信息。",
    ];
  }

  if (module === "product_content_audit") {
    return [
      "检查核心产品页是否能在首屏说明产品是什么、卖给谁、解决什么问题。",
      "确认参数表、认证、案例、FAQ 和视频至少覆盖一个重点产品或重点行业页面。",
      "让销售或产品同事用页面内容回答采购常见问题，记录仍需人工补充的信息。",
      "重新运行诊断，确认内容审核模块中的未通过项明显减少。",
    ];
  }

  if (module === "form_tracking") {
    return [
      "在 GA4 实时报告中提交测试表单，确认 generate_lead 或 form_submit 事件出现。",
      "在 Meta、LinkedIn 或对应广告平台的测试事件工具里确认 Lead 事件触发。",
      "点击带 UTM 的测试链接并提交表单，确认 CRM、后台或分析工具能看到来源参数。",
      "用隐私模式访问网站，确认 Cookie 横幅和隐私政策入口正常展示。",
    ];
  }

  return [
    "重新运行诊断，确认模块分数和未通过项发生变化。",
    "用真实用户路径复核修复结果。",
    "记录修复前后的关键指标。",
  ];
}

function moduleExpectedResult(module?: string): string {
  if (module === "global_acceleration") {
    return "完成后，海外用户首屏等待时间会更稳定，广告点击后的跳出风险降低，重点页面更适合承接美国市场流量。";
  }
  if (module === "lead_page_check") {
    return "完成后，买家更容易放心提交需求，销售团队收到的线索信息更完整，垃圾提交和无效沟通会减少。";
  }
  if (module === "product_content_audit") {
    return "完成后，产品页会更像一份可用于采购评审的资料包，买家可以更快判断适配度、合规性和供应商可信度。";
  }
  if (module === "form_tracking") {
    return "完成后，市场团队能把广告花费、访问行为和询盘结果连接起来，后续可以按渠道质量和转化成本持续优化。";
  }
  return "完成后，网站的基础信任、转化路径和复盘能力会更清晰。";
}

function moduleWorkEstimate(result: any): string {
  const split = splitFindings(result);
  const issueCount = split.gaps.length + split.optimizations.length;
  if (issueCount >= 6) return "1天以上";
  if (issueCount >= 3) return "半天";
  return "少于1小时";
}

function detailedModuleSection(result: any): string {
  const title = moduleTitle(result?.module);
  const score = moduleScore(result);
  const actions = moduleActions(result?.module)
    .map((action, index) => `${index + 1}. ${action}`)
    .join("\n");
  const verification = moduleVerification(result?.module)
    .map((item) => `- ${item}`)
    .join("\n");
  const supplemental = buildSupplementalMarkdown(result);

  return `### ${title}

**评分**: ${score}/100

#### 关键发现

**优势**

${detailedFindingLines(result, "strengths")}

**缺口与风险**

${detailedFindingLines(result, "risks")}

#### 影响分析

${moduleImpactAnalysis(result)}

#### 修复建议

${actions}

${supplemental ? `${supplemental}\n\n` : ""}#### 验证方式

${verification}

#### 预期结果

${moduleExpectedResult(result?.module)}

#### 工时估算

${moduleWorkEstimate(result)}`;
}

function existingModuleSection(markdown: string, title: string): string | null {
  const pattern = new RegExp(`^###\\s+${escapeRegExp(title)}\\s*\\n[\\s\\S]*?(?=^###\\s+|^##\\s+|(?![\\s\\S]))`, "m");
  return markdown.match(pattern)?.[0]?.trim() || null;
}

function isUsefulModuleSection(section: string): boolean {
  const required = ["#### 关键发现", "#### 影响分析", "#### 修复建议", "#### 验证方式", "#### 预期结果"];
  return section.length >= 900 && required.every((heading) => section.includes(heading));
}

function buildModuleAnalysisSection(markdown: string, toolResults: any[]): string {
  const sections = CANONICAL_MODULES.map(({ id, title }) => {
    const existing = existingModuleSection(markdown, title);
    if (existing && isUsefulModuleSection(existing)) return existing;
    return detailedModuleSection(resultForModule(toolResults, id));
  });

  return `## 模块分析\n\n${sections.join("\n\n")}`;
}

function enforceFourModuleAnalysis(markdown: string, toolResults: any[]): string {
  return replaceH2Section(markdown, /^##\s+(模块分析|Module Analysis).*$/m, buildModuleAnalysisSection(markdown, toolResults));
}

function generateFallbackReport(input: ReportInput, reason: string): ReportOutput {
  const { url, targetMarket, understanding, toolResults, language } = input;
  const lang = language || "zh-CN";
  const dateString = new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
  const brandName = toBrandName(url);
  const reportTitle = `${brandName} 跨境出海诊断报告`;
  const modules = Array.isArray(toolResults) ? toolResults : [];
  const scores = modules.map(moduleScore);
  const overall = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 60;
  const moduleSections = CANONICAL_MODULES
    .map(({ id }) => detailedModuleSection(resultForModule(modules, id)))
    .join("\n\n");
  const scoreRows = modules.map((result: any) => {
    const score = moduleScore(result);
    return `| ${moduleTitle(result?.module)} | 25 | ${score} | ${Number((score * 0.25).toFixed(2))} |`;
  }).join("\n");

  const markdown = `# ${reportTitle}

诊断日期：${dateString} / 目标市场：${targetMarketLabel(targetMarket)} / 产品类型：${understanding?.productType || "待确认"} / 综合评分：${overall}/100

## 目录

- [执行摘要](#执行摘要)
- [模块分析](#模块分析)
- [30/60/90 天路线图](#306090-天路线图)
- [评分分解表](#评分分解表)
- [综合评分与结论](#综合评分与结论)

## 执行摘要

- 当前报告为规则版诊断报告，原因：${reason}。
- 网站已完成基础页面读取，初步产品定位为：${understanding?.productType || "待确认"}。
- 核心价值主张初步提取为：${understanding?.keyValueProposition || "需要进一步确认"}。
- 四个自动化模块已完成规则检查，可作为下一步优化的基础问题清单。

**整体判断：当前功能可以继续用于本地演示和基础诊断；配置 DEEPSEEK_API_KEY 后会启用更完整的 AI 顾问报告。**

## 模块分析

${moduleSections || "暂无模块结果。"}

## 30/60/90 天路线图

### 第 1-30 天

1. 先修复未通过项，尤其是访问速度、表单转化追踪和信任元素。
2. 补齐首页和核心产品页的目标用户、使用场景和核心卖点。

### 第 31-60 天

1. 增加客户案例、FAQ、产品参数和对比内容。
2. 完成 GA4、广告像素和关键表单事件追踪。

### 第 61-90 天

1. 基于诊断结果和投放数据持续复测。
2. 对重点市场制作本地化落地页和内容版本。

## 评分分解表

| 评估模块 | 权重 | 得分 | 加权得分 |
|---|---:|---:|---:|
${scoreRows || "| 暂无模块 | 100 | 60 | 60 |"}
| 总计 | 100 | - | ${overall} |

## 综合评分与结论

**综合评分：${overall}/100**

这份规则版报告已经能帮助定位基础问题。若要获得更完整的定位判断、业务影响解释和修复优先级，请在后端环境中配置 DEEPSEEK_API_KEY 后重新运行诊断。`;

  const md = new MarkdownIt();
  return { markdown, html: md.render(markdown) };
}

async function polishReportDraft(
  draftMarkdown: string,
  input: ReportInput,
  moduleDigest: any[],
  reportTitle: string,
): Promise<string> {
  const lang = input.language || "zh-CN";
  const isEnglish = lang.startsWith("en");
  const languageInstruction = isEnglish
    ? "Rewrite the report in English."
    : "请用中文润色报告。";

  const editorPrompt = `You are the final editor for a cross-border website diagnostic report. Rewrite the draft into a more useful consultant-grade report while preserving the same Markdown document structure.

${languageInstruction}

Editing goals:
- Keep the H1 exactly as: ${reportTitle}
- Do not change the diagnostic date, target market, product type, module scores, score weights, or total score. These fields are computed by code.
- Keep the same top-level sections: 目录, 执行摘要, 模块分析, 30/60/90 天路线图, 评分分解表, 综合评分与结论.
- Keep exactly four H3 module sections in this order: 访问与加载体验, 落地页转化诊断, 产品与合规内容诊断, 线索与表单追踪诊断.
- Do not invent facts that are not supported by the module evidence digest.
- Make each module more detailed than the draft, especially 关键发现, 影响分析, 修复建议, 验证方式, 预期结果.
- Preserve useful fenced code blocks and YouTube/external reference links from the draft. You may move them to the correct subsection, but do not delete them when they are relevant to the module fix.

Module writing standard:
- Under #### 关键发现, split findings into two labels: **优势** and **缺口与风险**.
- Under **优势**, write 2-4 flat bullets when there are passed checks. If there are no passed checks, write one sentence saying no clear advantage was detected.
- Under **缺口与风险**, write 3-6 flat bullets using failed and warning checks. Each bullet must include the detected fact, why it matters for a buyer or marketer, and the practical implication.
- #### 影响分析 must be 2 short paragraphs. Explain business impact first, then technical or operational reason.
- #### 修复建议 must contain 4-6 numbered actions. Each action should mention where to change it, what to add/configure, and what good looks like.
- #### 验证方式 must contain 3-5 concrete checks the user can run after fixing.
- #### 预期结果 must contain 2-3 bullets or one short paragraph that connects the fix to trust, conversion, analytics, or speed outcomes.
- Keep Markdown clean. No emoji. No nested lists. No decorative callouts. No HTML.

Return the complete revised Markdown only.`;

  const editorUserContent = `Target URL: ${input.url}
Target Market: ${input.targetMarket}

Product Understanding:
${JSON.stringify(input.understanding, null, 2)}

Module Evidence Digest:
${JSON.stringify(moduleDigest, null, 2)}

Draft Markdown:
${draftMarkdown}

Rewrite the full report now.`;

  try {
    return await callDeepSeek({
      messages: [
        { role: "system", content: editorPrompt },
        { role: "user", content: editorUserContent },
      ],
      temperature: 0.35,
      maxTokens: 8192,
    });
  } catch {
    return draftMarkdown;
  }
}

export interface ReportInput {
  url: string;
  targetMarket: string;
  understanding: any;
  toolResults: any[];
  language?: string;
}

export interface ReportOutput {
  markdown: string;
  html: string;
}

export async function generateReport(
  input: ReportInput,
  onChunk?: (chunk: string) => void
): Promise<ReportOutput> {
  const { url, targetMarket, understanding, toolResults, language } = input;
  const lang = language || "zh-CN";
  const isEnglish = lang.startsWith("en");

  const now = new Date();
  const dateString = now.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
  const brandName = toBrandName(url);
  const reportTitle = isEnglish
    ? `${brandName} Cross-Border Diagnostic Report`
    : `${brandName} 跨境出海诊断报告`;
  const moduleDigest = buildModuleDigest(toolResults);

  const languageInstruction = isEnglish
    ? "Please write the entire report in English. All section titles, evaluations, and recommendations must be in English."
    : "请用中文撰写整份报告。所有章节标题、评估结论和建议都必须使用中文。";

  const systemPrompt = `You are a senior cross-border e-commerce consultant. Generate a professional diagnostic report in clean Markdown format. The report is read by founders and website owners. It must stay technically useful, but still readable for non-engineers. Do NOT include any preamble — start directly with the report title.

Current date: ${dateString}.

${languageInstruction}

## Audience & Tone

- The reader is a founder or website owner. They want to understand the issue quickly and act on it directly.
- Explain technical issues clearly, but do not hide the technical fix.
- NEVER use emoji anywhere in the report.
- NEVER put raw code, configuration snippets, or technical syntax inside regular text paragraphs. If you need to show code, ALWAYS put it inside a fenced code block (triple backticks with language tag).
- NEVER use inline code marks (single backticks \`) anywhere in the report.
- Be specific, evidence-backed, and consultant-like. The report should explain why each finding matters, not only restate detection results.
- Use short paragraphs, but do not be superficial. Each module should feel materially more useful than a raw checklist.
- The report must read like a clean Markdown document, not a chat message and not a marketing page.

## Report Structure (strict order, each section separated by a blank line)

### 0. Table of Contents
Place a clickable TOC right after the title. Use Markdown anchor links: [Section Name](#section-name). The anchor slug must be the heading text lowercased, spaces replaced by hyphens, punctuation removed. Include the report sections that help the reader navigate the report, but do NOT include the report title, the meta bar line, or the nested H3 items under 30/60/90 Day Roadmap.

### 1. Title
H1: "${reportTitle}"

### 2. Meta Bar
One plain line directly below the title. Use this exact content: 诊断日期 / 目标市场 / 产品类型 / 综合评分. Do NOT make it a heading.

### 3. Executive Summary (H2)
3-5 bullet points of key findings. Then ONE separate paragraph with a bold overall assessment. The assessment paragraph must be on its own line, separated from the bullet list by a blank line.

### 4. Module Analysis (H2)
This section MUST contain exactly four H3 subsections in this exact order:
1. 访问与加载体验
2. 落地页转化诊断
3. 产品与合规内容诊断
4. 线索与表单追踪诊断

Each H3 subsection must use this internal structure in the exact order below:

A. Module score on its own line:
**评分**: XX/100

B. A subsection heading:
#### 关键发现

Under it, split the findings into two labels:
**优势**
**缺口与风险**

Under **优势**, summarize passed checks. Each bullet must explain what was detected and why it helps trust, conversion, speed, or measurement.

Under **缺口与风险**, summarize failed and warning checks. Each bullet must include: detected fact, buyer or marketer impact, and practical implication. Do not merely repeat the raw finding.

C. A subsection heading:
#### 影响分析

Write 2 short paragraphs. Explain business impact first, then the technical or operational reason. For B2B products, connect the issue to procurement confidence, inquiry quality, sales cycle, or market entry risk where relevant.

D. A subsection heading:
#### 修复建议

Use a numbered list with 4-6 actions. Each item must mention where to change it, what to add or configure, and what a good finished state looks like.

E. If useful, add:
#### 参考代码

Only include this subsection if a code or configuration snippet is truly necessary. Put the snippet in a fenced code block. Do not explain the code line by line.

F. Add:
#### 验证方式

Write 3-5 short bullets describing exactly how the user can confirm the fix.

G. Add:
#### 预期结果

Write one short paragraph or 2-3 bullets connecting the fix to expected improvements in buyer trust, inquiry conversion, analytics quality, page speed, or compliance confidence.

H. Add:
#### 工时估算

Write one short sentence only: 少于1小时 / 半天 / 1天以上

I. If there is a useful external learning resource, add:
#### 参考资料

Use a simple bullet list of links only. Example:
- [How to Enable HTTP/2 on Nginx](https://www.youtube.com/results?search_query=How+to+Enable+HTTP%2F2+on+Nginx)

Do NOT nest solution blocks inside finding bullets. Keep the section flat and document-like.

### 5. 30/60/90 Day Roadmap (H2)
Three H3 subsections. Each subsection contains numbered action items (1. 2. 3.). Each item must be a single sentence or short paragraph in plain language.

### 6. Score Breakdown Table (H2)
A Markdown table with columns: 评估模块 | 权重 | 得分 | 加权得分
- Table cells must contain PLAIN TEXT only. No bold, no italic, no emoji inside cells.
- Scores must be plain numbers. Example correct cell: \`65\`, not \`**65**\`.
- Ensure weighted scores add up correctly.

### 7. Overall Score & Verdict (H2)
Bold final score on its own line. Then a conclusion paragraph on the next line.

## Markdown Formatting Rules (deviation breaks rendering)

1. **Blank lines are mandatory**: Every block-level element (heading, paragraph, list, table, code block) must be separated from the previous element by exactly one blank line. Never stack elements directly against each other.

2. **Bold markers must be paired**: **text**. NEVER put a space immediately after opening ** or before closing **.

3. **Bullet lists**: Use "- " where "-" is the FIRST character on the line. No extra spaces before "-".

4. **Code blocks ONLY**: Any code, configuration, script, or technical snippet MUST be inside a fenced code block:
   \`\`\`html
   <!-- code here -->
   \`\`\`\`
   NEVER put code inside regular text.

5. **Tables**: Proper pipe syntax with separator line |---|---|---|. No formatting inside cells.

6. **Finding format (MANDATORY)**:
   CORRECT: \`- **CDN部署**: 已检测到 CDN 加速服务，这有助于降低海外首屏等待时间，并提升广告落地页承接稳定性。\`
   WRONG: \`- ** CDN部署**: \` (space after **), \`-**CDN部署**: \` (missing space after -), \`- **CDN部署:**通过\` (colon inside bold), \`- **CDN部署**: **通过**\` (extra bold on status)

7. **Line breaks within paragraphs**: Do NOT insert manual line breaks inside a paragraph. Let paragraphs flow as one block of text. Markdown renders single newlines as spaces.

8. **External links**: When recommending a YouTube tutorial or external reference, use a plain Markdown link in a bullet list. Do not add emoji, teaser copy, or duplicate descriptions.

9. **No HTML tags**: Use standard Markdown syntax only.

10. **Numbers**: Use correct decimal points. Time values must include decimal (e.g. "13.5 seconds" not "135 seconds").

## Output Requirements

- Preserve the exact four-module structure.
- Preserve or include relevant #### 参考代码 and #### 参考资料 subsections when the module has implementation snippets or YouTube/external learning links.
- Prefer clean headings, short paragraphs, plain lists, and standard Markdown.
- Do not generate decorative callouts, emoji markers, or duplicated labels.
- Make the report look like it belongs in a Markdown editor such as Typora or a professional technical document.
- Be specific, actionable, and professional. Use the Module Evidence Digest as the primary source of facts, and use the raw tool results only for details not present in the digest.`;

  const userContent = `Target URL: ${url}
Target Market: ${targetMarket}

Product Understanding:
${JSON.stringify(understanding, null, 2)}

Module Evidence Digest:
${JSON.stringify(moduleDigest, null, 2)}

Diagnostic Tool Results:
${JSON.stringify(toolResults, null, 2)}

Generate the complete diagnostic report now. Start directly with the H1 title. Follow the structure and formatting rules exactly. Output ONLY the report — no preamble, no closing remarks. Remember: business owners read this, not developers. The report should be detailed enough that the user does not need to ask the consultant bot for the obvious follow-up explanation.`;

  const messages: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let markdown: string;
  try {
    if (onChunk) {
      markdown = await callDeepSeek(
        {
          messages,
          temperature: 0.4,
          maxTokens: 8192,
          stream: true,
        },
        onChunk
      );
    } else {
      markdown = await callDeepSeek({
        messages,
        temperature: 0.4,
        maxTokens: 8192,
      });
    }
  } catch (err) {
    if (isMissingDeepSeekApiKey(err)) {
      return generateFallbackReport(input, "DEEPSEEK_API_KEY 未配置");
    }
    throw err;
  }

  markdown = await polishReportDraft(markdown, input, moduleDigest, reportTitle);
  markdown = normalizeHeadingSpacing(markdown);
  markdown = removeInlineCode(markdown);
  markdown = normalizeReportTitle(markdown, reportTitle);
  markdown = normalizeMetaLine(markdown, dateString, targetMarket, understanding, toolResults);
  markdown = enforceFourModuleAnalysis(markdown, toolResults);
  markdown = ensureSupplementalSections(markdown, toolResults);
  markdown = normalizeScoreBreakdown(markdown, toolResults);
  markdown = normalizeComputedScores(markdown);
  markdown = normalizeHeadingSpacing(markdown);

  const md = new MarkdownIt();
  const html = md.render(markdown);

  return { markdown, html };
}
