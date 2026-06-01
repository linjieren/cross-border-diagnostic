import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { fingerprint, isDuplicate, similarityScore } from "../lib/dedup";
import * as fs from "fs";
import * as path from "path";

export const feedbackRouter = Router();

interface FeedbackBody {
  id?: string;
  source?: string;
  type: "text" | "screenshot" | "both";
  content: {
    text: string;
    screenshots?: string[];
    fingerprint?: string;
  };
  meta: {
    timestamp?: string;
    version?: string;
    page?: string;
    user_agent?: string;
  };
}

// ---- 原有：创建反馈 ----
feedbackRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { id, source, type, content, meta } = req.body as FeedbackBody;

    if (!content?.text && (!content?.screenshots || content.screenshots.length === 0)) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.feedbackContentRequired") ?? "content.text or content.screenshots is required" });
      return;
    }

    const feedbackId = id || `fbk-${Date.now()}-${content.fingerprint || "00000000"}`;
    const ts = meta?.timestamp ? new Date(meta.timestamp) : new Date();

    const today = ts.toISOString().slice(0, 10);
    const rawDir = path.join(process.cwd(), "feedback/raw", today);
    fs.mkdirSync(rawDir, { recursive: true });

    const screenshotPaths: string[] = [];
    if (content.screenshots && content.screenshots.length > 0) {
      const ssDir = path.join(rawDir, "screenshots");
      fs.mkdirSync(ssDir, { recursive: true });
      for (let i = 0; i < content.screenshots.length; i++) {
        const filename = `${feedbackId}_${i}.png`;
        const base64Data = content.screenshots[i].replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(path.join(ssDir, filename), Buffer.from(base64Data, "base64"));
        screenshotPaths.push(`screenshots/${filename}`);
      }
    }

    const entry = {
      id: feedbackId,
      source: source || "dev-feedback-button",
      type,
      content: {
        text: content.text || "",
        screenshots: screenshotPaths,
        fingerprint: content.fingerprint || null,
      },
      meta: {
        timestamp: ts.toISOString(),
        version: meta?.version || "dev",
        page: meta?.page || "",
        user_agent: meta?.user_agent || "",
      },
    };

    fs.writeFileSync(path.join(rawDir, `${feedbackId}.json`), JSON.stringify(entry, null, 2));

    try {
      await prisma.feedback.create({
        data: {
          id: feedbackId,
          source: entry.source,
          type,
          text: content.text || "",
          screenshots: screenshotPaths,
          fingerprint: content.fingerprint || null,
          version: meta?.version || "dev",
          page: meta?.page || "",
          userAgent: meta?.user_agent || "",
          timestamp: ts,
        },
      });
    } catch {
      // DB write is best-effort; filesystem is primary
    }

    res.status(201).json({ id: feedbackId, status: "received" });
  } catch (err) {
    console.error("feedback error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- B-001/B-003：列表查询 ----
feedbackRouter.get("/", async (req: Request, res: Response) => {
  try {
    const dedupStatus = (req.query.dedupStatus as string) || "all";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (dedupStatus === "unique") {
      where.duplicateOf = null;
    } else if (dedupStatus === "duplicates") {
      where.duplicateOf = { not: null };
    }

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);

    res.json({
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    console.error("list feedback error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- B-003：单条去重检测 ----
feedbackRouter.post("/dedup", async (req: Request, res: Response) => {
  try {
    const { feedbackId } = req.body as { feedbackId: string };
    if (!feedbackId) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.feedbackIdRequired") ?? "feedbackId is required" });
      return;
    }

    const target = await prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!target) {
      res.status(404).json({ error: (req as any).t?.("apiErrors.feedbackNotFound") ?? "feedback not found" });
      return;
    }

    const targetFp = fingerprint(target.text);

    // 查找所有已有反馈中不为自己、且未被标记为重复的项，按时间从早到晚
    const candidates = await prisma.feedback.findMany({
      where: {
        id: { not: feedbackId },
      },
      orderBy: { createdAt: "asc" },
    });

    let duplicateOf: string | null = null;
    let duplicateGroupId: string | null = null;
    let bestScore = 0;
    let reason = "未找到重复";

    for (const cand of candidates) {
      const candFp = fingerprint(cand.text);
      const score = similarityScore(targetFp, candFp);
      if (score >= 0.8 && score > bestScore) {
        bestScore = score;
        duplicateOf = cand.id;
        duplicateGroupId = cand.duplicateGroupId || `dg-${candFp}`;
        reason = `文本相似度 ${(score * 100).toFixed(1)}%`;
      }
    }

    // 更新反馈记录
    await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        duplicateOf,
        duplicateGroupId,
      },
    });

    res.json({
      duplicateOf,
      duplicateGroupId,
      confidence: bestScore,
      reason,
    });
  } catch (err) {
    console.error("dedup error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// ---- B-003：批量去重巡检 ----
feedbackRouter.post("/dedup-all", async (req: Request, res: Response) => {
  try {
    // 权限控制：简单检查请求头中的 x-admin-token（与 docker-compose 中环境变量对齐）
    const adminToken = req.headers["x-admin-token"] as string;
    const expectedToken = process.env.ADMIN_TOKEN || "dev-admin-token";
    if (adminToken !== expectedToken) {
      res.status(403).json({ error: (req as any).t?.("apiErrors.forbidden") ?? "forbidden" });
      return;
    }

    // 获取所有未标记去重状态的反馈
    const unprocessed = await prisma.feedback.findMany({
      where: {
        duplicateOf: null,
      },
      orderBy: { createdAt: "asc" },
    });

    let processedCount = 0;
    let groupCount = 0;

    // 用 Map 缓存指纹避免重复计算
    const fpCache = new Map<string, string>();
    for (const fb of unprocessed) {
      fpCache.set(fb.id, fingerprint(fb.text));
    }

    for (let i = 0; i < unprocessed.length; i++) {
      const target = unprocessed[i];
      const targetFp = fpCache.get(target.id)!;

      let duplicateOf: string | null = null;
      let duplicateGroupId: string | null = null;

      // 只与更早的反馈比对
      for (let j = 0; j < i; j++) {
        const cand = unprocessed[j];
        const candFp = fpCache.get(cand.id)!;
        if (isDuplicate(targetFp, candFp)) {
          duplicateOf = cand.duplicateOf || cand.id; // 指向主反馈
          duplicateGroupId = cand.duplicateGroupId || `dg-${candFp}`;
          break;
        }
      }

      if (duplicateOf) {
        await prisma.feedback.update({
          where: { id: target.id },
          data: { duplicateOf, duplicateGroupId },
        });
        groupCount++;
      }
      processedCount++;
    }

    res.json({ processedCount, groupCount });
  } catch (err) {
    console.error("dedup-all error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});
