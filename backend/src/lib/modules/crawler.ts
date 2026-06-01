import { Page } from "playwright";

export interface CrawledPage {
  url: string;
  title: string;
  pageType: string;
  depth: number;
  weight: number;
}

const STATIC_EXTENSIONS = new Set([
  "css", "js", "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "avif",
  "pdf", "zip", "tar", "gz", "mp4", "mp3", "wav", "ogg", "webm", "woff", "woff2", "ttf", "eot",
]);

const PAGE_TYPE_PATTERNS: Array<{ type: string; keywords: string[]; weight: number }> = [
  { type: "home", keywords: ["/home", "/index", "/main"], weight: 3.0 },
  { type: "product", keywords: ["/product", "/products", "/solution", "/solutions", "/service", "/services"], weight: 2.0 },
  { type: "pricing", keywords: ["/pricing", "/price", "/plan", "/plans", "/subscription", "/cost"], weight: 2.0 },
  { type: "about", keywords: ["/about", "/company", "/team", "/story", "/mission"], weight: 1.5 },
  { type: "contact", keywords: ["/contact", "/contact-us", "/support", "/help", "/chat"], weight: 1.5 },
  { type: "faq", keywords: ["/faq", "/faqs", "/question", "/help-center", "/knowledge"], weight: 1.5 },
  { type: "cases", keywords: ["/case", "/cases", "/portfolio", "/client", "/customer", "/testimonial", "/review"], weight: 1.5 },
  { type: "blog", keywords: ["/blog", "/news", "/article", "/post", "/press", "/insight"], weight: 1.0 },
];

function isStaticResource(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split(".").pop();
    if (ext && STATIC_EXTENSIONS.has(ext)) return true;
    return false;
  } catch {
    return true;
  }
}

function getSameDomainLinks(pageUrl: string, hrefs: string[]): string[] {
  const base = new URL(pageUrl);
  const sameDomain: string[] = [];
  for (const href of hrefs) {
    try {
      const u = new URL(href, base.href);
      if (u.hostname !== base.hostname) continue;
      if (isStaticResource(u.href)) continue;
      sameDomain.push(u.href);
    } catch {
      // ignore invalid URLs
    }
  }
  return sameDomain;
}

function detectPageType(url: string, title: string): { type: string; weight: number } {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  for (const pattern of PAGE_TYPE_PATTERNS) {
    if (pattern.keywords.some((k) => lowerUrl.includes(k))) {
      return { type: pattern.type, weight: pattern.weight };
    }
  }

  // Title-based fallback
  const titlePatterns: Array<{ type: string; keywords: string[]; weight: number }> = [
    { type: "product", keywords: ["product", "solution", "service", "feature"], weight: 2.0 },
    { type: "pricing", keywords: ["pricing", "price", "plan", "subscription", "cost"], weight: 2.0 },
    { type: "about", keywords: ["about us", "company", "team", "story", "mission"], weight: 1.5 },
    { type: "contact", keywords: ["contact", "support", "help", "chat"], weight: 1.5 },
    { type: "faq", keywords: ["faq", "question", "help center", "knowledge"], weight: 1.5 },
    { type: "cases", keywords: ["case study", "portfolio", "client", "customer", "testimonial"], weight: 1.5 },
    { type: "blog", keywords: ["blog", "news", "article", "insight"], weight: 1.0 },
  ];

  for (const pattern of titlePatterns) {
    if (pattern.keywords.some((k) => lowerTitle.includes(k))) {
      return { type: pattern.type, weight: pattern.weight };
    }
  }

  return { type: "other", weight: 1.0 };
}

export async function crawlSite(
  page: Page,
  startUrl: string,
  maxPages = 20,
  maxDepth = 3
): Promise<CrawledPage[]> {
  const results: CrawledPage[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);

    try {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch {
        continue;
      }

      const title = await page.title().catch(() => "");
      const { type, weight } = detectPageType(url, title);

      results.push({ url, title, pageType: type, depth, weight });

      // Extract links for next level
      if (depth < maxDepth && results.length < maxPages) {
        const hrefs: string[] = await page.evaluate(
          // @ts-ignore document exists in browser evaluate context
          () => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as any).href)
        );
        const sameDomain = getSameDomainLinks(url, hrefs);
        for (const link of sameDomain) {
          if (!visited.has(link) && results.length + queue.length < maxPages) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    } catch {
      // Skip unreachable pages
    }
  }

  return results;
}
