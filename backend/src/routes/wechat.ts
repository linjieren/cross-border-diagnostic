import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

// In-memory state store with TTL (replace with Redis in production)
interface StateEntry {
  createdAt: number;
  bindUserId?: string;
}

const stateStore = new Map<string, StateEntry>();

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [key, entry] of stateStore) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(key);
    }
  }
}

// Run cleanup every 2 minutes
setInterval(cleanupExpiredStates, 2 * 60 * 1000);

function isCredentialConfigured(): boolean {
  return !!(WECHAT_APPID && WECHAT_APPSECRET);
}

// ---- 类型定义 ----

export interface WeChatQRCodeResponse {
  qrUrl: string;
  state: string;
  expiresAt: number;
}

export interface WeChatCallbackRequest {
  code: string;
  state: string;
}

// ---- 路由 ----

export const wechatRouter = Router();

// POST /api/wechat/qrcode
// 生成微信扫码登录的二维码 URL（需要微信开放平台凭证）
wechatRouter.post("/qrcode", async (req: Request, res: Response) => {
  try {
    const bindUserId = (req as any).user?.id;
    const state = generateState();
    const redirectUri = `${APP_BASE_URL}/api/wechat/callback`;

    stateStore.set(state, {
      createdAt: Date.now(),
      bindUserId,
    });

    if (!isCredentialConfigured()) {
      // Return a mock URL for framework testing when credentials are missing
      res.status(503).json({
        error: (req as any).t?.("apiErrors.wechatOAuthNotConfigured") ?? "wechat oauth not configured",
        message: (req as any).t?.("apiErrors.wechatMissingCredentials") ?? "微信登录未配置：缺少 WECHAT_APPID / WECHAT_APPSECRET 环境变量",
        state,
        redirectUri,
        // TODO: replace with real WeChat QR URL once credentials are provided
        qrUrl: `https://open.weixin.qq.com/connect/qrconnect?appid=MOCK&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}`,
      });
      return;
    }

    const qrUrl =
      `https://open.weixin.qq.com/connect/qrconnect?` +
      `appid=${WECHAT_APPID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=snsapi_login&` +
      `state=${state}`;

    const response: WeChatQRCodeResponse = {
      qrUrl,
      state,
      expiresAt: Date.now() + STATE_TTL_MS,
    };

    res.json(response);
  } catch (err) {
    console.error("wechat qrcode error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// POST /api/wechat/callback
// 微信 OAuth 回调处理
wechatRouter.post("/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body as WeChatCallbackRequest;
    if (!code || !state) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.codeAndStateRequired") ?? "code and state are required" });
      return;
    }

    // 1. Validate state (CSRF protection)
    const stateEntry = stateStore.get(state);
    if (!stateEntry || Date.now() - stateEntry.createdAt > STATE_TTL_MS) {
      res.status(403).json({ error: (req as any).t?.("apiErrors.invalidOrExpiredState") ?? "invalid or expired state" });
      return;
    }
    stateStore.delete(state);

    if (!isCredentialConfigured()) {
      res.status(501).json({
        error: (req as any).t?.("apiErrors.wechatOAuthNotConfigured") ?? "wechat oauth not configured",
        message: (req as any).t?.("apiErrors.wechatMissingCredentialsDetail") ?? "微信登录未配置：缺少 WECHAT_APPID / WECHAT_APPSECRET 环境变量。请联系管理员配置微信开放平台账号。",
      });
      return;
    }

    // TODO: implement real WeChat OAuth flow once credentials are available
    // 2. Exchange code for access_token
    // const tokenRes = await fetch(
    //   `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}&secret=${WECHAT_APPSECRET}&code=${code}&grant_type=authorization_code`
    // );
    // const tokenData = await tokenRes.json();
    // ...

    res.status(501).json({
      error: (req as any).t?.("apiErrors.notFullyImplemented") ?? "not fully implemented",
      message: (req as any).t?.("apiErrors.wechatCallbackNotImplemented") ?? "微信 OAuth 回调框架已就绪，但完整用户查询/创建逻辑需在提供凭证后实现",
    });
  } catch (err) {
    console.error("wechat callback error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// POST /api/wechat/bind
// 为已登录用户绑定微信账号
wechatRouter.post("/bind", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: (req as any).t?.("apiErrors.unauthorized") ?? "unauthorized" });
      return;
    }

    const { code, state } = req.body as { code?: string; state?: string };
    if (!code || !state) {
      res.status(400).json({ error: (req as any).t?.("apiErrors.codeAndStateRequired") ?? "code and state are required" });
      return;
    }

    // Validate state
    const stateEntry = stateStore.get(state);
    if (!stateEntry || Date.now() - stateEntry.createdAt > STATE_TTL_MS) {
      res.status(403).json({ error: (req as any).t?.("apiErrors.invalidOrExpiredState") ?? "invalid or expired state" });
      return;
    }
    stateStore.delete(state);

    if (!isCredentialConfigured()) {
      res.status(501).json({
        error: (req as any).t?.("apiErrors.wechatOAuthNotConfigured") ?? "wechat oauth not configured",
        message: (req as any).t?.("apiErrors.wechatBindNotConfigured") ?? "微信绑定未配置：缺少 WECHAT_APPID / WECHAT_APPSECRET 环境变量",
      });
      return;
    }

    // TODO: implement real binding logic after credentials are provided
    res.status(501).json({
      error: (req as any).t?.("apiErrors.notFullyImplemented") ?? "not fully implemented",
      message: (req as any).t?.("apiErrors.wechatBindNotImplemented") ?? "微信绑定框架已就绪，完整逻辑需在提供凭证后实现",
    });
  } catch (err) {
    console.error("wechat bind error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});

// POST /api/wechat/unbind
// 解绑微信账号
wechatRouter.post("/unbind", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: (req as any).t?.("apiErrors.unauthorized") ?? "unauthorized" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        wechatOpenId: null,
        wechatUnionId: null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("wechat unbind error:", err);
    res.status(500).json({ error: (req as any).t?.("apiErrors.internalError") ?? "internal error" });
  }
});
