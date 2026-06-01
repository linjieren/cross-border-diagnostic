import { Router, Request, Response } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

// i18n language detection test endpoint
healthRouter.get("/lang", (req: Request, res: Response) => {
  const i18nReq = req as any;
  res.json({
    status: "ok",
    language: i18nReq.language || "unknown",
    languages: i18nReq.languages || [],
    t: i18nReq.t ? i18nReq.t("report.title") : null,
  });
});
