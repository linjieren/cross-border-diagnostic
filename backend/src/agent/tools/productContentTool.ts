import { withPage, ToolResult } from "./_helper";

export async function productContentTool(url: string): Promise<ToolResult> {
  return withPage(url, async (page) => {
    const findings: ToolResult["findings"] = [];

    const result: any = await page.evaluate(`
      (() => {
        const text = document.body.innerText.toLowerCase();
        const html = document.body.innerHTML.toLowerCase();

        // Compliance certs
        const certPatterns = ['ce', 'fcc', 'ul ', 'rohs', 'iso', 'certification', 'compliant', '认证', '合规'];
        const hasCert = certPatterns.some(p => new RegExp('\\\\b' + p + '\\\\b').test(text));

        // Customer endorsements
        const hasTestimonials = text.includes('testimonial') || text.includes('customer review') || text.includes('client') || text.includes('客户') || document.querySelectorAll('blockquote').length > 0;

        // Technical params
        const hasSpecs = document.querySelectorAll('table').length > 0 && /specification|specs|technical parameters|dimensions|参数|规格/.test(text);

        // Working principle
        const hasWorkingPrinciple = /how it works|working principle|原理|工作流程|mechanism/.test(text) || document.querySelectorAll('video').length > 0;

        // Credibility data
        const hasNumbers = /\\d+\\s*%|performance|benchmark|test report|verified by/.test(text);

        // FAQ
        const hasFaq = text.includes('faq') || text.includes('frequently asked') || text.includes('常见问题') || document.querySelectorAll('details').length > 0;

        // Pricing
        const hasPricing = document.querySelectorAll('[class*="price"], [class*="pricing"]').length > 0 || /pricing|price|plan|套餐|价格/.test(text);

        // Video
        const videoCount = document.querySelectorAll('video').length + Array.from(document.querySelectorAll('iframe[src]')).filter((i: any) => i.src.includes('youtube.com/embed')).length;

        // Social proof
        const hasSocialProof = /★|☆|⭐|rating|review|star/.test(html) || document.querySelectorAll('[class*="review"], [class*="rating"]').length > 0;

        // Content matrix
        const links = Array.from(document.querySelectorAll('a[href]')).map(a => ((a as any).href || '').toLowerCase());
        const linkTexts = Array.from(document.querySelectorAll('a[href]')).map(a => ((a as any).textContent || '').toLowerCase());
        const hasBlog = links.some(h => /blog|news|articles/.test(h)) || linkTexts.some(t => /blog|news|articles/.test(t));
        const hasCaseStudy = links.some(h => /case study|success story|客户案例/.test(h)) || linkTexts.some(t => /case study|success story|客户案例/.test(t));

        return {
          hasCert, hasTestimonials, hasSpecs, hasWorkingPrinciple, hasNumbers,
          hasFaq, hasPricing, videoCount, hasSocialProof, hasBlog, hasCaseStudy,
        };
      })()
    `);

    findings.push({ check: "合规认证", status: result.hasCert ? "pass" : "fail", detail: result.hasCert ? "页面包含合规认证信息" : "未检测到 CE/FCC/UL/RoHS/ISO 等合规认证信息" });
    findings.push({ check: "客户背书", status: result.hasTestimonials ? "pass" : "fail", detail: result.hasTestimonials ? "检测到客户评价或案例引用" : "未检测到客户评价、案例引用等背书内容" });
    findings.push({ check: "技术参数", status: result.hasSpecs ? "pass" : "warn", detail: result.hasSpecs ? "页面包含技术参数表格" : "未检测到技术参数表，建议补充规格说明" });
    findings.push({ check: "工作原理", status: result.hasWorkingPrinciple ? "pass" : "warn", detail: result.hasWorkingPrinciple ? "页面包含工作原理说明或演示视频" : "未检测到工作原理说明，建议补充图文或视频" });
    findings.push({ check: "高可信度数据", status: result.hasNumbers ? "pass" : "warn", detail: result.hasNumbers ? "页面包含具体性能数据或测试指标" : "未检测到具体性能数据，建议补充量化指标" });
    findings.push({ check: "FAQ", status: result.hasFaq ? "pass" : "warn", detail: result.hasFaq ? "检测到 FAQ 区块" : "未检测到 FAQ，建议补充以减少客服负担并提升 SEO" });
    findings.push({ check: "定价信息", status: result.hasPricing ? "pass" : "warn", detail: result.hasPricing ? "检测到定价/方案信息" : "未检测到定价信息，透明定价可减少询盘摩擦" });
    findings.push({ check: "产品视频", status: result.videoCount > 0 ? "pass" : "warn", detail: result.videoCount > 0 ? `检测到 ${result.videoCount} 个视频` : "未检测到产品演示视频，视频可显著提升转化率" });
    findings.push({ check: "社交证明", status: result.hasSocialProof ? "pass" : "warn", detail: result.hasSocialProof ? "检测到评分/评价等社交证明" : "未检测到评分或评价内容" });
    findings.push({ check: "内容矩阵", status: result.hasBlog && result.hasCaseStudy ? "pass" : result.hasBlog || result.hasCaseStudy ? "warn" : "fail", detail: `博客/资讯: ${result.hasBlog ? "有" : "无"}, 案例研究: ${result.hasCaseStudy ? "有" : "无"}` });

    return { module: "product_content_audit", findings };
  });
}
