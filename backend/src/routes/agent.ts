import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { runAgentDiagnosis, AgentEvent } from "../agent/orchestrator";
import { chatWithConsultant, saveChatMessage, getChatHistory } from "../agent/consultantChat";
import { generatePdfFromHtml } from "../agent/pdfGenerator";

export const agentRouter = Router();

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
  } catch (err) {
    console.error("agent diagnose error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /api/agent/diagnose/:sessionId/stream
agentRouter.get("/diagnose/:sessionId/stream", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

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

    await runAgentDiagnosis(sessionId, session.url, session.targetMarket, sendEvent);

    sendEvent({ type: "report-complete" });
    res.end();
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
    res.status(500).json({ error: "internal error" });
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

    const pdfBuffer = await generatePdfFromHtml(session.reportHtml);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="report-${session.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("get pdf error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// POST /api/agent/consultant/:sessionId/chat
agentRouter.post("/consultant/:sessionId/chat", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { message } = req.body as { message: string };

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

    await saveChatMessage(sessionId, "user", message);

    const history = await getChatHistory(sessionId);
    const { reply, intent, quotedText } = await chatWithConsultant(
      sessionId,
      message,
      history,
      session.reportMarkdown || undefined,
      session.language || "zh-CN"
    );

    await saveChatMessage(sessionId, "assistant", reply, intent, quotedText);

    res.json({ reply, intent, quotedText });
  } catch (err) {
    console.error("consultant chat error:", err);
    res.status(500).json({ error: "internal error" });
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
    res.status(500).json({ error: "internal error" });
  }
});
