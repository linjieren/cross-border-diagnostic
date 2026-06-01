import { callDeepSeek, DeepSeekMessage } from "./deepseek";
import MarkdownIt from "markdown-it";

function removeInlineCode(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/`([^`\n]+)`/g, '$1');
  }).join('');
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

  const languageInstruction = isEnglish
    ? "Please write the entire report in English. All section titles, evaluations, and recommendations must be in English."
    : "请用中文撰写整份报告。所有章节标题、评估结论和建议都必须使用中文。";

  const systemPrompt = `You are a senior cross-border e-commerce consultant. Generate a professional diagnostic report in clean Markdown format. The report is read by business owners, NOT developers. Write in plain business language. Do NOT include any preamble — start directly with the report title.

Current date: ${dateString}.

${languageInstruction}

## Audience & Tone

- The reader is a business owner or marketing manager, not a developer.
- NEVER put raw code, configuration snippets, or technical syntax inside regular text paragraphs. If you need to show code, ALWAYS put it inside a fenced code block (triple backticks with language tag).
- NEVER use inline code marks (single backticks \`) anywhere in the report. Technical terms should be written directly without backticks. For example, write "在网站 head 标签中" instead of "在网站 \`<head>\` 标签中". Write "格式 G-XXXXXXXX" instead of "\`G-XXXXXXXX\`".
- Describe technical issues in plain business language. For example, instead of writing "未部署gtag('config', 'G-XXXXX')", write "未部署 Google Analytics 4 追踪代码".
- Be concise. One idea per sentence. Short paragraphs.

## Report Structure (strict order, each section separated by a blank line)

### 0. Table of Contents
Place a clickable TOC right after the title. Use Markdown anchor links: [Section Name](#section-name). The anchor slug must be the heading text lowercased, spaces replaced by hyphens, punctuation removed. Include all H2 and H3 sections.

### 1. Title
H1: "跨境出海诊断报告 · {domain}"

### 2. Meta Bar
One line: 诊断日期 / 目标市场 / 产品类型 / 综合评分

### 3. Executive Summary (H2)
3-5 bullet points of key findings. Then ONE separate paragraph with a bold overall assessment. The assessment paragraph must be on its own line, separated from the bullet list by a blank line.

### 4. Module Analysis (H2)
One H3 subsection per diagnostic module. Each subsection contains:

A. Module score on its own line: "**评分**: XX/100"

B. Findings as a clean bullet list. Each finding uses EXACTLY this pattern:
\`- **CheckName**: StatusSymbol Description sentence.\`

Status symbols: ✅ 通过 / ❌ 未通过 / ⚠️ 需优化

C. After ALL findings in a module, a blank line, then an analysis paragraph starting with "**分析**:". The analysis must describe the business impact in plain language. NO raw code in the analysis.

D. For each finding marked ❌ or ⚠️, append a solution block immediately after that finding bullet. The solution block must be indented with 2 spaces.

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
   CORRECT: \`- **CDN部署**: ✅ 通过。已检测到Cloudflare加速。\`
   WRONG: \`- ** CDN部署**: \` (space after **), \`-**CDN部署**: \` (missing space after -), \`- **CDN部署:**✅ \` (colon inside bold), \`- **CDN部署**: ✅ **通过**\` (extra bold on status)

7. **Line breaks within paragraphs**: Do NOT insert manual line breaks inside a paragraph. Let paragraphs flow as one block of text. Markdown renders single newlines as spaces.

8. **Video links**: When recommending a YouTube tutorial, use this exact format on its own line:
   \`📺 视频教程: [Title of Video](https://www.youtube.com/watch?v=VIDEO_ID)\`
   Replace VIDEO_ID with a real, well-known tutorial ID. Do not invent URLs.

9. **No HTML tags**: Use standard Markdown syntax only.

10. **Numbers**: Use correct decimal points. Time values must include decimal (e.g. "13.5 seconds" not "135 seconds").

## Actionable Solution Block Format

For every ❌ or ⚠️ finding, append this indented block immediately after the finding bullet (2-space indent):

\`\`\`
  - **CheckName**: ❌ 未通过 Description of the problem.
    - **解决方案**:
      - **下一步**: One concrete first action in plain language.
      - **操作指南** (choose at least one):
        1. **代码示例**: A copy-paste ready snippet inside a fenced code block with language tag.
        2. **分步操作**: Numbered list of exact steps.
        3. **视频教程**: 📺 视频教程: [Title](https://www.youtube.com/watch?v=VIDEO_ID) — one-line description.
      - **预期效果**: One sentence describing the success state.
      - **工时估算**: Quick win (少于1小时) / Medium effort (半天) / Large project (1天以上)
\`\`\`

Be specific, actionable, and professional. Leverage your knowledge base for tool-specific advice.`;

  const userContent = `Target URL: ${url}
Target Market: ${targetMarket}

Product Understanding:
${JSON.stringify(understanding, null, 2)}

Diagnostic Tool Results:
${JSON.stringify(toolResults, null, 2)}

Generate the complete diagnostic report now. Start directly with the H1 title. Follow the structure and formatting rules exactly. Output ONLY the report — no preamble, no closing remarks. Remember: business owners read this, not developers. Plain language, code only in fenced blocks.`;

  const messages: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let markdown: string;
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

  markdown = removeInlineCode(markdown);

  const md = new MarkdownIt();
  const html = md.render(markdown);

  return { markdown, html };
}
