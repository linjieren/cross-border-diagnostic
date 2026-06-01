import { Page } from "playwright";
import { prisma } from "../prisma";

interface ContentCheck {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

interface ProductStructure {
  credibilityData: ContentCheck;
  workingPrinciple: ContentCheck;
  technicalParams: ContentCheck;
  complianceCerts: ContentCheck;
  customerEndorsements: ContentCheck;
  competitiveComparison: ContentCheck;
  bonusItems: {
    competitiveAdvantages: ContentCheck;
    successCases: ContentCheck;
    fundingBackground: ContentCheck;
    exhibitionInfo: ContentCheck;
    mediaCoverage: ContentCheck;
  };
}

interface ContentMatrix {
  blogDetected: boolean;
  knowledgeBaseDetected: boolean;
  caseStudyDetected: boolean;
  guideDetected: boolean;
  evidence: string[];
}

interface WhitepaperCheck {
  detected: boolean;
  evidence: string[];
}

interface IndustryTemplate {
  industry: string;
  sections: string[];
  tips: string;
  htmlTemplate: string;
}

interface ExtraContent {
  faqDetected: boolean;
  pricingDetected: boolean;
  videoDetected: boolean;
  videoCount: number;
  socialProofDetected: boolean;
  teamPageDetected: boolean;
}

interface MOD003Findings {
  contentMatrix: ContentMatrix;
  whitepaper: WhitepaperCheck;
  structure: ProductStructure;
  extraContent: ExtraContent;
  score: number;
  scoreBreakdown: Record<string, number>;
  missingItems: Array<{ item: string; priority: "high" | "medium" | "low"; reason: string }>;
  templates: IndustryTemplate[];
  deploymentCode: string;
}

// ---- 内容矩阵检测 ----
async function detectContentMatrix(page: any): Promise<ContentMatrix> {
  const result: any = await page.evaluate(`
    (() => {
      const text = document.body.innerText.toLowerCase();
      const links = Array.from(document.querySelectorAll('a[href]'));
      const hrefs = links.map(a => (a.href || '').toLowerCase());
      const linkTexts = links.map(a => (a.textContent || '').toLowerCase());

      const blogPatterns = ['blog', 'news', 'articles', 'insights', '知识', '博客'];
      const kbPatterns = ['knowledge base', 'docs', 'documentation', 'help center', '资源中心', '文档'];
      const casePatterns = ['case study', 'case studies', 'success story', '客户案例', '案例'];
      const guidePatterns = ['guide', 'tutorial', 'how to', '使用指南', '教程'];

      const blogDetected = hrefs.some(h => blogPatterns.some(p => h.includes(p))) ||
        linkTexts.some(t => blogPatterns.some(p => t.includes(p)));
      const kbDetected = hrefs.some(h => kbPatterns.some(p => h.includes(p))) ||
        linkTexts.some(t => kbPatterns.some(p => t.includes(p)));
      const caseDetected = hrefs.some(h => casePatterns.some(p => h.includes(p))) ||
        linkTexts.some(t => casePatterns.some(p => t.includes(p)));
      const guideDetected = hrefs.some(h => guidePatterns.some(p => h.includes(p))) ||
        linkTexts.some(t => guidePatterns.some(p => t.includes(p)));

      const evidence = [];
      if (blogDetected) evidence.push('发现博客/资讯入口');
      if (kbDetected) evidence.push('发现知识库/文档中心');
      if (caseDetected) evidence.push('发现案例研究入口');
      if (guideDetected) evidence.push('发现使用指南入口');

      return { blogDetected, knowledgeBaseDetected: kbDetected, caseStudyDetected: caseDetected, guideDetected, evidence };
    })()
  `);
  return result;
}

// ---- 白皮书/下载检测 ----
async function detectWhitepaper(page: any): Promise<WhitepaperCheck> {
  const result: any = await page.evaluate(`
    (() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const buttons = Array.from(document.querySelectorAll('button'));
      const patterns = ['whitepaper', 'white paper', 'download', 'pdf', ' brochure', 'datasheet', '数据表', '白皮书', '下载'];

      const evidence = [];
      for (const el of [...links, ...buttons]) {
        const text = (el.textContent || '').toLowerCase();
        const href = (el.href || '').toLowerCase();
        for (const p of patterns) {
          if (text.includes(p) || href.includes(p)) {
            evidence.push(text.slice(0, 60) || href.slice(0, 60));
            break;
          }
        }
      }
      return { detected: evidence.length > 0, evidence: evidence.slice(0, 5) };
    })()
  `);
  return result;
}

// ---- 产品页结构完整性分析 ----
async function analyzeProductStructure(page: any): Promise<ProductStructure> {
  const result: any = await page.evaluate(`
    (() => {
      const text = document.body.innerText.toLowerCase();
      const html = document.body.innerHTML.toLowerCase();

      // 高可信度数据：具体数字、百分比、测试报告、第三方验证
      const hasNumbers = /\\d+\\s*%|\\d+\\s*(ms|kg|mm|hz|watt|voltage)|performance|benchmark|test report|verified by|certified by|第三方测试/.test(text);
      const credibility = {
        detected: hasNumbers,
        confidence: hasNumbers ? 'high' : 'low',
        evidence: hasNumbers ? ['页面包含具体性能数据或测试指标'] : []
      };

      // 工作原理
      const wpPatterns = ['how it works', 'working principle', '原理', '工作流程', 'how does', 'mechanism', 'process'];
      const hasImages = document.querySelectorAll('img').length > 3;
      const hasVideo = document.querySelectorAll('video').length > 0 || text.includes('watch video') || text.includes('观看视频');
      const workingPrinciple = {
        detected: wpPatterns.some(p => text.includes(p)) || hasVideo,
        confidence: hasVideo ? 'high' : (wpPatterns.some(p => text.includes(p)) ? 'medium' : 'low'),
        evidence: [
          ...(wpPatterns.some(p => text.includes(p)) ? ['发现工作原理文字说明'] : []),
          ...(hasVideo ? ['发现产品演示视频'] : [])
        ]
      };

      // 技术参数
      const tableCount = document.querySelectorAll('table').length;
      const specPatterns = ['specification', 'specs', 'technical parameters', 'dimensions', 'material', 'compatibility', '参数', '规格', '尺寸', '材质'];
      const technicalParams = {
        detected: tableCount > 0 && specPatterns.some(p => text.includes(p)),
        confidence: tableCount > 0 ? 'high' : 'low',
        evidence: tableCount > 0 ? [\`发现 \${tableCount} 个表格，可能包含技术参数\`] : []
      };

      // 合规认证
      const certPatterns = ['ce', 'fcc', 'ul ', 'rohs', 'iso', 'certification', 'compliant', '认证', '合规'];
      const certDetected = certPatterns.some(p => {
        const regex = new RegExp('\\\\b' + p + '\\\\b');
        return regex.test(text);
      });
      const complianceCerts = {
        detected: certDetected,
        confidence: certDetected ? 'medium' : 'low',
        evidence: certDetected ? ['发现合规认证相关关键词'] : []
      };

      // 客户背书
      const testimonialPatterns = ['testimonial', 'customer review', 'client', '用户', '客户', 'testimonial', 'case study', 'success story'];
      const quoteCount = document.querySelectorAll('blockquote').length;
      const customerEndorsements = {
        detected: testimonialPatterns.some(p => text.includes(p)) || quoteCount > 0,
        confidence: quoteCount > 0 ? 'high' : 'medium',
        evidence: [
          ...(quoteCount > 0 ? [\`发现 \${quoteCount} 处引用/评价块\`] : []),
          ...(testimonialPatterns.some(p => text.includes(p)) ? ['发现客户评价相关关键词'] : [])
        ]
      };

      // 竞品对比
      const comparePatterns = ['vs', 'compare', 'comparison', 'versus', '竞品', '对比', 'competitor'];
      const competitiveComparison = {
        detected: comparePatterns.some(p => text.includes(p)),
        confidence: 'medium',
        evidence: comparePatterns.some(p => text.includes(p)) ? ['发现竞品对比相关关键词'] : []
      };

      // 加分项
      const advantage = { detected: text.includes('advantage') || text.includes('优势') || text.includes('why choose'), confidence: 'medium', evidence: [] };
      const success = { detected: text.includes('success') || text.includes('成果') || text.includes('里程碑'), confidence: 'low', evidence: [] };
      const funding = { detected: text.includes('funding') || text.includes('invest') || text.includes('融资') || text.includes('投资'), confidence: 'low', evidence: [] };
      const exhibition = { detected: text.includes('exhibition') || text.includes('trade show') || text.includes('展会') || text.includes('博览会'), confidence: 'low', evidence: [] };
      const media = { detected: text.includes('media') || text.includes('press') || text.includes('报道') || text.includes('news'), confidence: 'low', evidence: [] };

      return {
        credibilityData: credibility,
        workingPrinciple,
        technicalParams,
        complianceCerts,
        customerEndorsements,
        competitiveComparison,
        bonusItems: {
          competitiveAdvantages: advantage,
          successCases: success,
          fundingBackground: funding,
          exhibitionInfo: exhibition,
          mediaCoverage: media,
        }
      };
    })()
  `);
  return result;
}

// ---- 评分计算 ----
function calculateScore(structure: ProductStructure): { score: number; breakdown: Record<string, number> } {
  const weights: Record<string, number> = {
    complianceCerts: 20,
    customerEndorsements: 20,
    technicalParams: 15,
    workingPrinciple: 15,
    credibilityData: 15,
    competitiveComparison: 10,
    bonus: 5,
  };

  const breakdown: Record<string, number> = {};

  breakdown.complianceCerts = structure.complianceCerts.detected ? weights.complianceCerts : 0;
  breakdown.customerEndorsements = structure.customerEndorsements.detected ? weights.customerEndorsements : 0;
  breakdown.technicalParams = structure.technicalParams.detected ? weights.technicalParams : 0;
  breakdown.workingPrinciple = structure.workingPrinciple.detected ? weights.workingPrinciple : 0;
  breakdown.credibilityData = structure.credibilityData.detected ? weights.credibilityData : 0;
  breakdown.competitiveComparison = structure.competitiveComparison.detected ? weights.competitiveComparison : 0;

  const bonusCount = [
    structure.bonusItems.competitiveAdvantages.detected,
    structure.bonusItems.successCases.detected,
    structure.bonusItems.fundingBackground.detected,
    structure.bonusItems.exhibitionInfo.detected,
    structure.bonusItems.mediaCoverage.detected,
  ].filter(Boolean).length;
  breakdown.bonus = Math.min(weights.bonus, bonusCount * 2);

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, Math.round(total)), breakdown };
}

// ---- 额外内容检测（FAQ、定价、视频、社交证明、团队页） ----
async function detectExtraContent(page: any): Promise<ExtraContent> {
  const result: any = await page.evaluate(`
    (() => {
      const text = document.body.innerText.toLowerCase();
      const html = document.body.innerHTML.toLowerCase();

      // FAQ detection
      const faqPatterns = ['faq', 'frequently asked', '常见问题', '问题解答', 'q&a'];
      const hasFaqSection = document.querySelectorAll('details, [id*="faq"], [class*="faq"]').length > 0;
      const faqDetected = hasFaqSection || faqPatterns.some(p => text.includes(p));

      // Pricing detection
      const pricingPatterns = ['pricing', 'price', 'plan', '套餐', '价格', '费用', '订阅'];
      const hasPricingTable = document.querySelectorAll('[class*="price"], [class*="pricing"]').length > 0;
      const pricingDetected = hasPricingTable || pricingPatterns.some(p => text.includes(p));

      // Video detection
      const videos = document.querySelectorAll('video');
      const iframes = Array.from(document.querySelectorAll('iframe[src]'));
      const youtubeEmbeds = iframes.filter(i => (i.src || '').includes('youtube.com/embed')).length;
      const vimeoEmbeds = iframes.filter(i => (i.src || '').includes('vimeo.com')).length;
      const videoCount = videos.length + youtubeEmbeds + vimeoEmbeds;

      // Social proof detection
      const starPatterns = ['★', '☆', '⭐', 'rating', 'review', 'star'];
      const hasReviews = document.querySelectorAll('[class*="review"], [class*="rating"], [class*="testimonial"]').length > 0;
      const socialProofDetected = hasReviews || starPatterns.some(p => html.includes(p));

      // Team/About page detection
      const teamPatterns = ['team', 'about us', '关于我们', '团队', '创始人', 'leadership', 'management'];
      const hasTeamSection = document.querySelectorAll('[class*="team"], [class*="about"]').length > 0;
      const teamPageDetected = hasTeamSection || teamPatterns.some(p => text.includes(p));

      return {
        faqDetected,
        pricingDetected,
        videoDetected: videoCount > 0,
        videoCount,
        socialProofDetected,
        teamPageDetected,
      };
    })()
  `);
  return result;
}

// ---- 缺失清单生成 ----
function generateMissingItems(structure: ProductStructure, extra: ExtraContent): Array<{ item: string; priority: "high" | "medium" | "low"; reason: string }> {
  const items: Array<{ item: string; priority: "high" | "medium" | "low"; reason: string }> = [];

  if (!structure.complianceCerts.detected) {
    items.push({ item: "目标市场合规认证", priority: "high", reason: "海外买家高度关注 CE/FCC/UL/RoHS 等认证，缺失会直接影响采购决策" });
  }
  if (!structure.customerEndorsements.detected) {
    items.push({ item: "客户背书与案例", priority: "high", reason: "B2B 采购决策中，同行推荐和真实案例是最有说服力的信任信号" });
  }
  if (!structure.technicalParams.detected) {
    items.push({ item: "技术参数表", priority: "medium", reason: "专业买家需要具体规格来评估产品是否匹配需求" });
  }
  if (!structure.workingPrinciple.detected) {
    items.push({ item: "产品工作原理说明", priority: "medium", reason: "图文/视频说明可降低买家理解门槛，提升转化率" });
  }
  if (!structure.credibilityData.detected) {
    items.push({ item: "高可信度数据", priority: "medium", reason: "具体性能数据、测试报告是差异化竞争的关键" });
  }
  if (!structure.competitiveComparison.detected) {
    items.push({ item: "竞品对比", priority: "low", reason: "客观对比表可帮助买家快速决策" });
  }
  if (!structure.bonusItems.competitiveAdvantages.detected) {
    items.push({ item: "竞争优势总结", priority: "low", reason: "提炼核心卖点，强化品牌记忆" });
  }
  if (!extra.faqDetected) {
    items.push({ item: "FAQ 常见问题", priority: "medium", reason: "FAQ 可减少客服负担并提升 SEO" });
  }
  if (!extra.videoDetected) {
    items.push({ item: "产品演示视频", priority: "medium", reason: "视频内容可显著提升转化率（平均提升 80%）" });
  }
  if (!extra.socialProofDetected) {
    items.push({ item: "社交证明（评价/评分）", priority: "medium", reason: "真实用户评价是最有效的信任信号之一" });
  }
  if (!extra.pricingDetected) {
    items.push({ item: "定价/方案页面", priority: "low", reason: "透明定价可减少询盘摩擦，加速决策" });
  }

  return items;
}

// ---- 行业模板 ----
function getIndustryTemplates(): IndustryTemplate[] {
  const manufacturingHtml = `<!-- 制造业硬件产品详情页模板 -->
<section class="product-detail">
  <h1>产品名称</h1>
  <div class="hero-gallery">[产品高清图 + 360° 旋转视图]</div>

  <section class="specs">
    <h2>技术参数</h2>
    <table>
      <tr><th>尺寸</th><td>xxx mm</td></tr>
      <tr><th>重量</th><td>xxx kg</td></tr>
      <tr><th>材质</th><td>xxx</td></tr>
      <tr><th>工作温度</th><td>-20°C ~ 60°C</td></tr>
      <tr><th>兼容性</th><td>CE / FCC / RoHS 认证</td></tr>
    </table>
  </section>

  <section class="certifications">
    <h2>合规认证</h2>
    <div class="cert-grid">
      <img src="ce-badge.svg" alt="CE Certified">
      <img src="fcc-badge.svg" alt="FCC Certified">
      <img src="rohs-badge.svg" alt="RoHS Compliant">
    </div>
  </section>

  <section class="testimonials">
    <h2>客户评价</h2>
    <blockquote>
      "产品质量超出预期，交付准时。"
      <footer>— 张三，采购总监，ABC Manufacturing</footer>
    </blockquote>
  </section>
</section>`;

  const saasHtml = `<!-- SaaS 软件产品详情页模板 -->
<section class="product-detail">
  <h1>产品名称</h1>
  <p class="tagline">一句话价值主张</p>

  <section class="how-it-works">
    <h2>工作原理</h2>
    <div class="steps">
      <div>1. 连接数据源</div>
      <div>2. 自动分析处理</div>
      <div>3. 生成洞察报告</div>
    </div>
  </section>

  <section class="specs">
    <h2>技术规格</h2>
    <ul>
      <li>支持 50+ 数据源集成</li>
      <li>API 响应时间 < 100ms</li>
      <li>99.9% SLA 可用性保障</li>
      <li>SOC 2 Type II 认证</li>
    </ul>
  </section>

  <section class="testimonials">
    <h2>客户案例</h2>
    <blockquote>
      "部署后团队效率提升 40%。"
      <footer>— 李四，CTO，TechCorp Inc.</footer>
    </blockquote>
  </section>
</section>`;

  const b2bHtml = `<!-- B2B 服务产品详情页模板 -->
<section class="product-detail">
  <h1>服务名称</h1>

  <section class="process">
    <h2>服务流程</h2>
    <ol>
      <li>需求诊断与评估</li>
      <li>定制化方案设计</li>
      <li>专业团队交付</li>
      <li>效果追踪与优化</li>
    </ol>
  </section>

  <section class="cases">
    <h2>成功案例</h2>
    <div class="case-card">
      <h3>客户 A — 制造业出海</h3>
      <p>3 个月内欧洲市场询盘量提升 300%</p>
    </div>
  </section>

  <section class="testimonials">
    <h2>客户评价</h2>
    <blockquote>
      "专业团队，响应迅速，结果可量化。"
      <footer>— 王五，CEO，GlobalTrade Co.</footer>
    </blockquote>
  </section>
</section>`;

  const consumerHtml = `<!-- 消费品产品详情页模板 -->
<section class="product-detail">
  <h1>产品名称</h1>
  <div class="gallery">[场景图 + 细节图 + 包装图]</div>

  <section class="highlights">
    <h2>核心卖点</h2>
    <ul>
      <li>卖点 1：具体数据支撑</li>
      <li>卖点 2：差异化优势</li>
      <li>卖点 3：用户痛点解决</li>
    </ul>
  </section>

  <section class="specs">
    <h2>产品规格</h2>
    <table>
      <tr><th>材质</th><td>xxx</td></tr>
      <tr><th>尺寸</th><td>xxx</td></tr>
      <tr><th>认证</th><td>FDA / CE / CPC</td></tr>
    </table>
  </section>

  <section class="social-proof">
    <h2>真实用户评价</h2>
    <div class="review">
      <img src="avatar.jpg" alt="用户头像">
      <p>"性价比很高，物流也快。"</p>
      <span>★★★★★</span>
    </div>
  </section>
</section>`;

  return [
    {
      industry: "制造业硬件",
      sections: ["产品图库", "技术参数表", "合规认证", "工作原理", "客户评价", "FAQ"],
      tips: "突出 CE/FCC/RoHS 认证标识，技术参数表需包含尺寸、重量、材质、兼容性。客户评价必须包含客户公司名+职位。",
      htmlTemplate: manufacturingHtml,
    },
    {
      industry: "SaaS / 软件",
      sections: ["价值主张", "工作原理", "集成能力", "安全认证", "客户案例", "定价"],
      tips: "用三步流程图说明工作原理，客户案例需量化结果（如效率提升 40%）。强调 SOC 2 / GDPR 合规。",
      htmlTemplate: saasHtml,
    },
    {
      industry: "B2B 服务",
      sections: ["服务流程", "成功案例", "团队资质", "客户评价", "服务范围"],
      tips: "成功案例用数据说话（询盘量提升 300%），服务流程用时间轴展示。客户评价需包含行业背景。",
      htmlTemplate: b2bHtml,
    },
    {
      industry: "消费品 / 零售",
      sections: ["场景图库", "核心卖点", "产品规格", "安全认证", "真实评价", "使用场景"],
      tips: "场景图比白底图转化率更高，真实评价配头像和星级。强调 FDA/CPC 等消费品认证。",
      htmlTemplate: consumerHtml,
    },
  ];
}

// ---- 部署代码 ----
function generateDeploymentCode(): string {
  return `<!-- 产品详情页增强模块 — 一键嵌入 -->
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
-->`;
}

// ---- 主分析函数 ----

export async function analyzeProductContent(pageId: string, url: string, page: Page): Promise<void> {
  const result = await prisma.diagnosticResult.findFirst({
    where: { pageId, module: "product_content_audit" },
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

    const [contentMatrix, whitepaper, structure, extraContent] = await Promise.all([
      detectContentMatrix(page),
      detectWhitepaper(page),
      analyzeProductStructure(page),
      detectExtraContent(page),
    ]);

    const { score: baseScore, breakdown } = calculateScore(structure);
    // 额外内容加分
    const bonusScore = Math.min(15,
      (extraContent.videoDetected ? 5 : 0) +
      (extraContent.faqDetected ? 3 : 0) +
      (extraContent.socialProofDetected ? 4 : 0) +
      (extraContent.pricingDetected ? 2 : 0) +
      (extraContent.teamPageDetected ? 1 : 0)
    );
    const score = Math.min(100, baseScore + bonusScore);

    const missingItems = generateMissingItems(structure, extraContent);
    const templates = getIndustryTemplates();
    const deploymentCode = generateDeploymentCode();

    const findings: MOD003Findings = {
      contentMatrix,
      whitepaper,
      structure,
      extraContent,
      score,
      scoreBreakdown: breakdown,
      missingItems,
      templates,
      deploymentCode,
    };

    const summary = score >= 75
      ? `产品页内容较完整，评分 ${score}/100（含 ${extraContent.videoCount} 个视频）`
      : score >= 45
      ? `产品页内容有基础但缺失较多关键元素，评分 ${score}/100`
      : `产品页内容严重不足，评分 ${score}/100，建议立即补充核心模块`;

    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        score,
        findings: findings as any,
        reportData: {
          summary,
          recommendations: [
            ...missingItems.map(m => `[${m.priority === 'high' ? '紧急' : m.priority === 'medium' ? '建议' : '可选'}] ${m.item}: ${m.reason}`),
            ...(contentMatrix.blogDetected ? [] : ['建议添加博客/资讯入口，建立内容矩阵']),
            ...(whitepaper.detected ? [] : ['建议提供白皮书/技术文档下载，提升专业形象']),
            ...(extraContent.videoDetected ? [] : ['建议添加产品演示视频，视频页转化率平均提升 80%']),
            ...(extraContent.faqDetected ? [] : ['建议添加 FAQ 区块，可减少客服负担并提升 SEO']),
          ],
          missingItems,
          templates,
          deploymentCode,
        } as any,
      },
    });
  } catch (err) {
    console.error(`MOD-003 analysis error for page ${pageId}:`, err);
    await prisma.diagnosticResult.update({
      where: { id: result.id },
      data: { status: "failed" },
    });
  }
}
