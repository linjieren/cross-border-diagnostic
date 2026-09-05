import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { healthRouter } from "./routes/health";
import { feedbackRouter } from "./routes/feedback";
import { diagnosticRouter } from "./routes/diagnostic";
import { agentRouter } from "./routes/agent";
import { authRouter, optionalAuth } from "./routes/auth";
import { wechatRouter } from "./routes/wechat";
import { initI18n, i18nMiddleware } from "./i18n/config";

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Initialize i18n before middleware
  await initI18n();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  // i18n middleware must be after cookie-parser, before routes
  app.use(i18nMiddleware);

  // Optional auth on all routes
  app.use(optionalAuth);

  // 静态文件：诊断截图和报告
  app.use("/screenshots", express.static(path.join(process.cwd(), "diagnostic/screenshots")));
  app.use("/reports", express.static(path.join(process.cwd(), "diagnostic/reports")));

  // SSE（/api/agent 的 text/event-stream）经 nginx 反代时禁止缓冲；
  // X-Accel-Buffering 由后端设置，避免改动 routes/agent.ts
  app.use("/api/agent", (req, res, next) => {
    res.setHeader("X-Accel-Buffering", "no");
    next();
  });

  app.use("/health", healthRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/diagnostic", diagnosticRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/wechat", wechatRouter);

  return app;
}
