import { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * 进程内滑动窗口 IP 限流（单实例 MVP 用，无外部依赖）。
 * 多实例部署时需替换为 Redis 等共享存储实现。
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = "too many requests, please try again later" } = options;
  const hits = new Map<string, number[]>();

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }, windowMs);
  sweeper.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(retryAfter, 1)));
      res.status(429).json({ error: (req as any).t?.("apiErrors.rateLimited") ?? message });
      return;
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}
