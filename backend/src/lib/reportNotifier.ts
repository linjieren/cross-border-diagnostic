import { prisma } from "./prisma";
import { isEmailConfigured, sendMail } from "./mailer";
import { moduleScore } from "../agent/scoring";

// 诊断完成后的邮件通知：仅对登录且绑定邮箱的用户发送，未配置 SMTP 时静默跳过。
// 由 orchestrator 以 fire-and-forget 方式调用，发送失败不得影响诊断流程。

interface ToolResultLike {
  module?: string;
  findings?: { status?: string }[];
  error?: string;
}

export async function notifyReportReady(sessionId: string): Promise<void> {
  if (!isEmailConfigured()) return;

  const session = await prisma.diagnosticSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  const email = session?.user?.email;
  if (!session || !email) return;

  const steps = Array.isArray(session.agentSteps) ? (session.agentSteps as any[]) : [];
  const toolResults = steps.find((s) => s?.step === 2)?.result as ToolResultLike[] | undefined;
  let overall: number | null = null;
  if (Array.isArray(toolResults) && toolResults.length > 0) {
    const scores = toolResults.map((r) => moduleScore(r));
    overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  const reportUrl = `${baseUrl}/report/${session.id}`;
  const zh = (session.language || "zh-CN").startsWith("zh");
  const scoreText = overall === null ? "" : zh ? `综合得分：${overall}/100` : `Overall score: ${overall}/100`;

  await sendMail({
    to: email,
    subject: zh
      ? `诊断报告已生成：${session.url}${overall === null ? "" : `（${overall}/100）`}`
      : `Your diagnostic report is ready: ${session.url}${overall === null ? "" : ` (${overall}/100)`}`,
    text: zh
      ? [
          `您的网站诊断已完成。`,
          ``,
          `网站：${session.url}`,
          `目标市场：${session.targetMarket}`,
          scoreText,
          ``,
          `查看完整报告：${reportUrl}`,
          ``,
          `如需进一步解读报告，可在报告页面向 AI 顾问追问。`,
        ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n")
      : [
          `Your website diagnostic is complete.`,
          ``,
          `Website: ${session.url}`,
          `Target market: ${session.targetMarket}`,
          scoreText,
          ``,
          `View the full report: ${reportUrl}`,
          ``,
          `You can ask the AI consultant follow-up questions on the report page.`,
        ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n"),
  });
}
