import { chromium } from "playwright";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReportDocumentHtml(html: string, title = "跨境出海诊断报告"): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #111827;
        --muted: #4b5563;
        --soft: #6b7280;
        --line: #e5e7eb;
        --panel: #ffffff;
        --wash: #f8fafc;
        --accent: #2563eb;
        --accent-soft: #eff6ff;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--wash);
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
        line-height: 1.72;
      }

      .report-page {
        width: min(100%, 1040px);
        margin: 0 auto;
        padding: 48px 28px;
      }

      .report-sheet {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
        padding: 56px 64px;
      }

      .report-brand {
        margin: 0 0 18px;
        color: var(--accent);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      h1, h2, h3, h4 {
        color: var(--ink);
        letter-spacing: 0;
        line-height: 1.25;
        page-break-after: avoid;
      }

      h1 {
        margin: 0 0 18px;
        font-size: 42px;
        font-weight: 850;
      }

      h2 {
        margin: 44px 0 18px;
        padding-top: 22px;
        border-top: 1px solid var(--line);
        font-size: 28px;
        font-weight: 800;
      }

      h3 {
        margin: 34px 0 12px;
        font-size: 21px;
        font-weight: 800;
      }

      h4 {
        margin: 26px 0 10px;
        color: #374151;
        font-size: 16px;
        font-weight: 800;
      }

      p {
        margin: 0 0 16px;
        color: #1f2937;
        font-size: 15px;
      }

      ul, ol {
        margin: 0 0 18px 24px;
        padding: 0;
      }

      li {
        margin: 7px 0;
        color: #1f2937;
        font-size: 15px;
      }

      strong { font-weight: 800; color: #111827; }

      a {
        color: #1d4ed8;
        text-decoration: none;
        overflow-wrap: anywhere;
      }

      a:hover { text-decoration: underline; }

      table {
        width: 100%;
        margin: 18px 0 26px;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 12px;
        font-size: 14px;
      }

      thead th {
        background: #f3f4f6;
        color: #111827;
        font-weight: 800;
      }

      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      tr:last-child td { border-bottom: 0; }
      tbody tr:nth-child(even) td { background: #f9fafb; }

      pre {
        margin: 18px 0 24px;
        padding: 18px;
        overflow: auto;
        border-radius: 12px;
        background: #0f172a;
        color: #e5e7eb;
        font-size: 12px;
        line-height: 1.65;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      }

      blockquote {
        margin: 18px 0;
        padding: 14px 18px;
        border-left: 4px solid var(--accent);
        background: var(--accent-soft);
        color: #1e3a8a;
      }

      hr {
        margin: 32px 0;
        border: 0;
        border-top: 1px solid var(--line);
      }

      .report-footer {
        margin-top: 40px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--soft);
        font-size: 12px;
      }

      @media print {
        @page {
          size: A4;
          margin: 16mm 14mm;
        }

        body {
          background: #ffffff;
        }

        .report-page {
          width: 100%;
          padding: 0;
        }

        .report-sheet {
          border: 0;
          border-radius: 0;
          box-shadow: none;
          padding: 0;
        }

        h1 { font-size: 34px; }
        h2 { font-size: 24px; }
        h3 { font-size: 19px; }

        table, pre, blockquote {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        a {
          color: #1d4ed8;
        }
      }
    </style>
  </head>
  <body>
    <main class="report-page">
      <article class="report-sheet">
        <p class="report-brand">Cross-Border Diagnostic</p>
        ${html}
        <footer class="report-footer">Generated by Cross-Border Diagnostic Platform</footer>
      </article>
    </main>
  </body>
</html>`;
}

export async function generatePdfFromHtml(html: string, title?: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportDocumentHtml(html, title), { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
