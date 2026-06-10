import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AgentEvent } from "../agent/orchestrator";
import { chatWithConsultant, saveChatMessage, getChatHistory } from "../agent/consultantChat";
import { buildReportDocumentHtml, generatePdfFromHtml } from "../agent/pdfGenerator";
import { getYouTubeMetadata } from "../agent/youtubeMetadata";
import {
  getSessionEventHistory,
  isSessionDiagnosisRunning,
  startSessionDiagnosis,
  subscribeToSession,
} from "../agent/sessionRuntime";

export const agentRouter = Router();

function isDatabaseUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.name} ${err.message}`.toLowerCase();
  return (
    text.includes("prismaclientinitializationerror") ||
    text.includes("can't reach database server") ||
    text.includes("database server") ||
    text.includes("connect to database")
  );
}

function languageOf(req: Request): string {
  const raw = (req as any).language;
  return typeof raw === "string" && raw ? raw : "zh-CN";
}

function fallbackMessage(req: Request, key: "databaseUnavailable" | "databaseUnavailableDetail" | "internalError"): string {
  const language = languageOf(req);
  const isJa = language.startsWith("ja");
  const isKo = language.startsWith("ko");
  const isEn = language.startsWith("en");

  if (key === "databaseUnavailable") {
    if (isEn) return "database service is unavailable";
    if (isJa) return "データベースサービスが起動していません";
    if (isKo) return "데이터베이스 서비스가 시작되지 않았습니다";
    return "数据库服务未启动";
  }

  if (key === "databaseUnavailableDetail") {
    if (isEn) return "The diagnostic database is not reachable right now. Start the local database service and try again.";
    if (isJa) return "現在、診断データベースに接続できません。ローカルのデータベースサービスを起動してから再試行してください。";
    if (isKo) return "현재 진단 데이터베이스에 연결할 수 없습니다. 로컬 데이터베이스 서비스를 시작한 뒤 다시 시도하세요.";
    return "当前无法连接诊断数据库，请先启动本地数据库服务后再重试。";
  }

  if (isEn) return "internal error";
  if (isJa) return "内部エラー";
  if (isKo) return "내부 오류";
  return "内部错误";
}

function sendAgentError(req: Request, res: Response, err: unknown) {
  if (isDatabaseUnavailableError(err)) {
    const t = (req as any).t;
    res.status(503).json({
      error: typeof t === "function" ? t("apiErrors.databaseUnavailable", fallbackMessage(req, "databaseUnavailable")) : fallbackMessage(req, "databaseUnavailable"),
      detail:
        typeof t === "function"
          ? t("apiErrors.databaseUnavailableDetail", fallbackMessage(req, "databaseUnavailableDetail"))
          : fallbackMessage(req, "databaseUnavailableDetail"),
    });
    return;
  }

  const t = (req as any).t;
  res.status(500).json({
    error: typeof t === "function" ? t("apiErrors.internalError", fallbackMessage(req, "internalError")) : fallbackMessage(req, "internalError"),
  });
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

function reportTitleFromMarkdown(markdown: string | null | undefined, sessionId: string): string {
  const match = markdown?.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || `跨境出海诊断报告-${sessionId}`;
}

function reportFileName(title: string, ext: "pdf" | "html"): string {
  const safe = title
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .trim();
  return `${safe || "cross-border-diagnostic-report"}.${ext}`;
}

function replayStoredProgress(session: {
  status: string;
  agentSteps: any;
  reportMarkdown: string | null;
  reportHtml: string | null;
}, sendEvent: (event: AgentEvent) => void) {
  const steps = Array.isArray(session.agentSteps) ? session.agentSteps : [];
  for (const step of steps) {
    if (step?.name === "error" && step?.error) {
      sendEvent({ type: "error", payload: { message: step.error } });
      continue;
    }

    if (typeof step?.step !== "number") continue;

    sendEvent({ type: "step-start", step: step.step, payload: { name: step.name } });
    if (step.result) {
      sendEvent({ type: "step-result", step: step.step, payload: step });
    }
    if (step.completedAt) {
      sendEvent({ type: "step-complete", step: step.step });
    }
  }

  if (session.status === "completed" && session.reportMarkdown && session.reportHtml) {
    sendEvent({ type: "report-complete" });
  }
}

// POST /api/agent/diagnose
agentRouter.post("/diagnose", async (req: Request, res: Response) => {
  try {
    const { url, targetMarket, language } = req.body as { url: string; targetMarket: string; language?: string };
    if (!url || !targetMarket) {
      res.status(400).json({ error: "url and targetMarket are required" });
      return;
    }

    const normalized = normalizeUrl(url);
    const sessionId = generateId("dsn");
    const userId = (req as any).user?.id || undefined;
    const lang = language || "zh-CN";

    await prisma.diagnosticSession.create({
      data: {
        id: sessionId,
        url: normalized,
        targetMarket,
        language: lang,
        status: "in_progress",
        userId,
      },
    });

    res.status(201).json({ sessionId, status: "in_progress" });
    void startSessionDiagnosis(sessionId);
  } catch (err) {
    console.error("agent diagnose error:", err);
    sendAgentError(req, res, err);
  }
});

// GET /api/agent/diagnose/:sessionId/stream
agentRouter.get("/diagnose/:sessionId/stream", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      sendEvent({ type: "error", payload: { message: "session not found" } });
      res.end();
      return;
    }

    sendEvent({ type: "step-start", step: 0, payload: { name: "connection_established" } });
    replayStoredProgress(session, sendEvent);

    if (session.status === "completed") {
      res.end();
      return;
    }

    if (session.status === "failed") {
      sendEvent({ type: "error", payload: { message: "diagnosis failed" } });
      res.end();
      return;
    }

    const history = getSessionEventHistory(sessionId);
    if (history.length) {
      for (const event of history) {
        sendEvent(event);
      }
    }

    const unsubscribe = subscribeToSession(sessionId, (event) => {
      sendEvent(event);
      if (event.type === "report-complete" || event.type === "error") {
        unsubscribe();
        res.end();
      }
    });

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });

    const stepCount = Array.isArray(session.agentSteps) ? session.agentSteps.length : 0;
    if (!isSessionDiagnosisRunning(sessionId) && stepCount === 0) {
      void startSessionDiagnosis(sessionId);
    }
  } catch (err: any) {
    sendEvent({ type: "error", payload: { message: err.message } });
    res.end();
  }
});

// GET /api/agent/diagnose/:sessionId/report
agentRouter.get("/diagnose/:sessionId/report", async (req: Request, res: Response) => {
  try {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: req.params.sessionId as string },
    });

    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    res.json({
      sessionId: session.id,
      url: session.url,
      targetMarket: session.targetMarket,
      status: session.status,
      reportMarkdown: session.reportMarkdown,
      reportHtml: session.reportHtml,
    });
  } catch (err) {
    console.error("get report error:", err);
    sendAgentError(req, res, err);
  }
});

// GET /api/agent/diagnose/:sessionId/report/pdf
agentRouter.get("/diagnose/:sessionId/report/pdf", async (req: Request, res: Response) => {
  try {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: req.params.sessionId as string },
    });

    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    if (!session.reportHtml) {
      res.status(400).json({ error: "report not yet generated" });
      return;
    }

    const title = reportTitleFromMarkdown(session.reportMarkdown, session.id);
    const pdfBuffer = await generatePdfFromHtml(session.reportHtml, title);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(title, "pdf"))}`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("get pdf error:", err);
    sendAgentError(req, res, err);
  }
});

// GET /api/agent/diagnose/:sessionId/report/html
agentRouter.get("/diagnose/:sessionId/report/html", async (req: Request, res: Response) => {
  try {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: req.params.sessionId as string },
    });

    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    if (!session.reportHtml) {
      res.status(400).json({ error: "report not yet generated" });
      return;
    }

    const title = reportTitleFromMarkdown(session.reportMarkdown, session.id);
    const html = buildReportDocumentHtml(session.reportHtml, title);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(title, "html"))}`);
    res.send(html);
  } catch (err) {
    console.error("get html report error:", err);
    sendAgentError(req, res, err);
  }
});

// GET /api/agent/youtube/metadata?url=...&title=...
agentRouter.get("/youtube/metadata", async (req: Request, res: Response) => {
  try {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    const title = typeof req.query.title === "string" ? req.query.title : undefined;

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      res.status(400).json({ error: "valid YouTube url is required" });
      return;
    }

    const metadata = await getYouTubeMetadata(url, title);
    if (!metadata) {
      res.status(404).json({ error: "metadata not found" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=21600");
    res.json(metadata);
  } catch (err) {
    console.error("youtube metadata error:", err);
    res.status(502).json({ error: "youtube metadata unavailable" });
  }
});

// POST /api/agent/consultant/:sessionId/chat
agentRouter.post("/consultant/:sessionId/chat", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { message, quotedText } = req.body as { message: string; quotedText?: string };

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      res.status(404).json({ error: "session not found" });
      return;
    }

    await saveChatMessage(sessionId, "user", message, undefined, quotedText);

    const history = await getChatHistory(sessionId);
    const { reply, intent, quotedText: assistantQuotedText } = await chatWithConsultant(
      sessionId,
      message,
      history,
      session.reportMarkdown || undefined,
      session.language || "zh-CN",
      quotedText
    );

    await saveChatMessage(sessionId, "assistant", reply, intent, assistantQuotedText);

    res.json({ reply, intent, quotedText: assistantQuotedText });
  } catch (err) {
    console.error("consultant chat error:", err);
    sendAgentError(req, res, err);
  }
});

// GET /api/agent/consultant/:sessionId/history
agentRouter.get("/consultant/:sessionId/history", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const history = await getChatHistory(sessionId);
    res.json({ history });
  } catch (err) {
    console.error("consultant history error:", err);
    sendAgentError(req, res, err);
  }
});
