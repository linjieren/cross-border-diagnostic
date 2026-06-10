import { withPage } from "./tools/_helper";
import { callDeepSeek, DeepSeekMessage } from "./deepseek";
import { globalAccelerationTool } from "./tools/globalAccelerationTool";
import { leadPageTool } from "./tools/leadPageTool";
import { productContentTool } from "./tools/productContentTool";
import { formTrackingTool } from "./tools/formTrackingTool";
import { generateReport, ReportInput } from "./reportGenerator";
import { prisma } from "../lib/prisma";

export interface AgentEvent {
  type: "step-start" | "step-think" | "step-result" | "step-complete" | "report-generating" | "report-complete" | "error";
  step?: number;
  payload?: any;
}

interface StepData {
  step: number;
  name: string;
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

function isMissingDeepSeekApiKey(err: unknown): boolean {
  return err instanceof Error && err.message.includes("DEEPSEEK_API_KEY is not configured");
}

function inferProductUnderstanding(pageContent: {
  title: string;
  metaDesc: string;
  h1: string;
  text: string;
}) {
  const combined = [pageContent.title, pageContent.metaDesc, pageContent.h1, pageContent.text]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const headline = pageContent.h1 || pageContent.title || "已读取页面内容";
  const lower = combined.toLowerCase();
  const productType =
    lower.includes("glasses") || lower.includes("wearable")
      ? "AI wearable / smart glasses"
      : lower.includes("software") || lower.includes("platform")
        ? "software platform"
        : headline;

  return {
    productType,
    targetAudience: "需要结合目标市场进一步验证的海外潜在用户",
    keyValueProposition: headline,
    mainConcerns: [
      "当前为规则识别结果，未使用大模型进行深度语义判断",
      pageContent.metaDesc || "页面缺少可直接提取的 meta description",
    ],
    recommendedFocus: [
      "补齐清晰的产品定位、目标用户和核心卖点表达",
      "结合后续四个模块检查结果优先处理影响转化的问题",
    ],
    source: "rule_based_fallback",
  };
}

export async function runAgentDiagnosis(
  sessionId: string,
  url: string,
  targetMarket: string,
  emit: (event: AgentEvent) => void
): Promise<void> {
  const steps: StepData[] = [];

  try {
    // Step 1: Product Understanding
    emit({ type: "step-start", step: 1, payload: { name: "product_understanding" } });
    const step1Start = new Date().toISOString();

    const pageContent = await withPage(url, async (page) => {
      return page.evaluate(() => {
        const title = document.title;
        const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
        const h1 = document.querySelector("h1")?.textContent || "";
        const text = document.body.innerText.slice(0, 3000);
        return { title, metaDesc, h1, text };
      });
    });

    const step1Messages: DeepSeekMessage[] = [
      {
        role: "system",
        content: `You are a senior cross-border e-commerce consultant. Analyze the given webpage content and extract key business understanding. Respond in JSON format with these fields: productType (string), targetAudience (string), keyValueProposition (string), mainConcerns (string[]), recommendedFocus (string[]). Target market: ${targetMarket}.`,
      },
      {
        role: "user",
        content: `URL: ${url}\nTitle: ${pageContent.title}\nMeta Description: ${pageContent.metaDesc}\nH1: ${pageContent.h1}\nPage Text: ${pageContent.text.slice(0, 2000)}`,
      },
    ];

    emit({ type: "step-think", step: 1, payload: { message: "Analyzing page content with DeepSeek..." } });

    let understanding: any;
    try {
      const understandingRaw = await callDeepSeek({
        messages: step1Messages,
        temperature: 0.4,
        maxTokens: 2048,
        responseFormat: { type: "json_object" },
      });

      try {
        understanding = JSON.parse(understandingRaw);
      } catch {
        understanding = { raw: understandingRaw };
      }
    } catch (err) {
      if (!isMissingDeepSeekApiKey(err)) throw err;
      understanding = inferProductUnderstanding(pageContent);
      emit({
        type: "step-think",
        step: 1,
        payload: { message: "DEEPSEEK_API_KEY 未配置，已切换为规则识别模式。" },
      });
    }

    const step1Result: StepData = {
      step: 1,
      name: "product_understanding",
      startedAt: step1Start,
      completedAt: new Date().toISOString(),
      result: understanding,
    };
    steps.push(step1Result);
    emit({ type: "step-result", step: 1, payload: step1Result });
    emit({ type: "step-complete", step: 1 });

    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { agentSteps: steps as any },
    });

    // Step 2: Tool Execution
    emit({ type: "step-start", step: 2, payload: { name: "tool_execution" } });
    const step2Start = new Date().toISOString();

    emit({ type: "step-think", step: 2, payload: { message: "Running diagnostic tools..." } });

    const [globalRes, leadRes, productRes, formRes] = await Promise.all([
      globalAccelerationTool(url).catch((e: any) => ({ module: "global_acceleration", findings: [], error: e.message })),
      leadPageTool(url).catch((e: any) => ({ module: "lead_page_check", findings: [], error: e.message })),
      productContentTool(url).catch((e: any) => ({ module: "product_content_audit", findings: [], error: e.message })),
      formTrackingTool(url).catch((e: any) => ({ module: "form_tracking", findings: [], error: e.message })),
    ]);

    const toolResults = [globalRes, leadRes, productRes, formRes];
    const step2Result: StepData = {
      step: 2,
      name: "tool_execution",
      startedAt: step2Start,
      completedAt: new Date().toISOString(),
      result: toolResults,
    };
    steps.push(step2Result);
    emit({ type: "step-result", step: 2, payload: step2Result });
    emit({ type: "step-complete", step: 2 });

    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { agentSteps: steps as any },
    });

    // Step 3: Report Generation
    emit({ type: "step-start", step: 3, payload: { name: "report_generation" } });
    emit({ type: "report-generating" });
    emit({ type: "step-think", step: 3, payload: { message: "生成中..." } });

    const sessionRecord = await prisma.diagnosticSession.findUnique({ where: { id: sessionId } });
    const reportInput: ReportInput = {
      url,
      targetMarket,
      understanding,
      toolResults,
      language: sessionRecord?.language || "zh-CN",
    };

    const report = await generateReport(reportInput);

    const step3Result: StepData = {
      step: 3,
      name: "report_generation",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: { markdownLength: report.markdown.length, htmlLength: report.html.length },
    };
    steps.push(step3Result);

    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: {
        agentSteps: steps as any,
        reportMarkdown: report.markdown,
        reportHtml: report.html,
        status: "completed",
      },
    });

    emit({ type: "step-result", step: 3, payload: step3Result });
    emit({ type: "step-complete", step: 3 });
    emit({ type: "report-complete", payload: { markdownLength: report.markdown.length, htmlLength: report.html.length } });
  } catch (err: any) {
    const errorStep: StepData = {
      step: steps.length + 1,
      name: "error",
      startedAt: new Date().toISOString(),
      error: err.message,
    };
    steps.push(errorStep);
    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { agentSteps: steps as any, status: "failed" },
    }).catch(() => {});
    emit({ type: "error", payload: { message: err.message } });
    throw err;
  }
}
