import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required. Set a strong random secret before starting the server.");
  process.exit(1);
}
const JWT_EXPIRES_IN = "7d";
const COOKIE_NAME = "auth_token";
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory code storage with TTL (replace with Redis in production)
const codeStore = new Map<string, { code: string; expiresAt: number; email?: string; phone?: string }>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [key, entry] of codeStore) {
    if (entry.expiresAt < now) {
      codeStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);

export const authRouter = Router();

// POST /api/auth/magic-link
authRouter.post("/magic-link", async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body as { email?: string; phone?: string };
    if (!email && !phone) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.emailOrPhoneRequired") ?? "email or phone is required" });
      return;
    }

    const target = email || phone!;
    const code = generateCode();
    const token = generateId();

    codeStore.set(token, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      email,
      phone,
    });

    // MVP: return code in response for easy testing
    // Production: send via SMS/email service
    console.warn(
      `[MVP-WARN] Magic-Link code for ${target} is being returned directly in the API response. ` +
      `This is ONLY for development/testing. In production, the code MUST be sent via a real SMS/email gateway.`
    );

    res.json({
      success: true,
      token,
      code,
      message: (req as any).t?.("apiErrors.mvpCodeWarning") ?? "【MVP 测试模式】验证码已直接返回。生产环境必须接入真实短信/邮件发送通道，禁止直接返回验证码。",
    });
  } catch (err) {
    console.error("magic-link error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// POST /api/auth/verify
authRouter.post("/verify", async (req: Request, res: Response) => {
  try {
    const { token, code } = req.body as { token: string; code: string };
    if (!token || !code) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.tokenAndCodeRequired") ?? "token and code are required" });
      return;
    }

    const entry = codeStore.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.invalidOrExpiredToken") ?? "invalid or expired token" });
      return;
    }

    if (entry.code !== code) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.invalidCode") ?? "invalid code" });
      return;
    }

    // Find or create user
    let user = null;
    if (entry.email) {
      user = await prisma.user.findUnique({ where: { email: entry.email } });
    } else if (entry.phone) {
      user = await prisma.user.findUnique({ where: { phone: entry.phone } });
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: generateId(),
          email: entry.email || null,
          phone: entry.phone || null,
          name: entry.email || entry.phone || null,
        },
      });
    }

    // Clear used code
    codeStore.delete(token);

    // Generate JWT
    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Set httpOnly cookie
    res.cookie(COOKIE_NAME, jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// GET /api/me
authRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.json({ user: null });
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      res.clearCookie(COOKIE_NAME);
      res.json({ user: null });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, phone: true, name: true, avatar: true },
    });

    if (!user) {
      res.clearCookie(COOKIE_NAME);
      res.json({ user: null });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// WeChat login placeholder
authRouter.post("/wechat/qrcode", async (req: Request, res: Response) => {
  res.status(501).json({
    error: (req as any).t?.("apiErrors.wechatLoginNotConfigured") ?? "wechat login not configured",
    message: (req as any).t?.("apiErrors.wechatLoginNotConfiguredMessage") ?? "微信登录需配置开放平台账号（appid/appsecret），请联系管理员",
  });
});

authRouter.post("/wechat/callback", async (req: Request, res: Response) => {
  res.status(501).json({
    error: (req as any).t?.("apiErrors.wechatLoginNotConfigured") ?? "wechat login not configured",
    message: (req as any).t?.("apiErrors.wechatLoginNotConfiguredMessage") ?? "微信登录需配置开放平台账号（appid/appsecret），请联系管理员",
  });
});

// Middleware: optional auth — attaches req.user if logged in, never rejects
export async function optionalAuth(req: Request, _res: Response, next: () => void) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload: any = jwt.verify(token, JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, phone: true, name: true, avatar: true },
      });
      if (user) {
        (req as any).user = user;
      }
    } catch {
      // ignore invalid token
    }
  }
  next();
}
