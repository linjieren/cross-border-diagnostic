import crypto from "crypto";

export type NotifyEventType =
  | "milestone_completed"
  | "build_success"
  | "build_failure"
  | "deploy_success"
  | "deploy_failure"
  | "alert"
  | "blocked"
  | "need_user_input";

export interface NotifyPayload {
  project: string;
  event: NotifyEventType;
  summary: string;
  detail?: string;
  timestamp?: number;
}

export class FeishuWebhookNotifier {
  private webhookUrl: string;
  private secret: string;

  constructor(webhookUrl: string, secret: string) {
    this.webhookUrl = webhookUrl;
    this.secret = secret;
  }

  private genSign(timestamp: number): string {
    const stringToSign = `${timestamp}\n${this.secret}`;
    const hmac = crypto.createHmac("sha256", stringToSign);
    return hmac.digest("base64");
  }

  private eventEmoji(event: NotifyEventType): string {
    switch (event) {
      case "milestone_completed":
        return "🎉";
      case "build_success":
        return "✅";
      case "deploy_success":
        return "🚀";
      case "build_failure":
        return "❌";
      case "deploy_failure":
        return "💥";
      case "alert":
        return "🚨";
      case "blocked":
        return "⛔";
      case "need_user_input":
        return "❓";
      default:
        return "📢";
    }
  }

  private formatMessage(payload: NotifyPayload): string {
    const ts = payload.timestamp ?? Date.now();
    const timeStr = new Date(ts).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
    });
    const lines = [
      `${this.eventEmoji(payload.event)} **${payload.project}** · ${payload.event}`,
      `**摘要**: ${payload.summary}`,
      `**时间**: ${timeStr}`,
    ];
    if (payload.detail) {
      lines.push(`**详情**: ${payload.detail}`);
    }
    return lines.join("\n");
  }

  async send(payload: NotifyPayload): Promise<{ ok: boolean; data?: unknown }> {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.genSign(timestamp);
    const body = {
      timestamp: String(timestamp),
      sign,
      msg_type: "text",
      content: {
        text: this.formatMessage(payload),
      },
    };

    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async sendTest(): Promise<{ ok: boolean; data?: unknown }> {
    return this.send({
      project: "跨境出海诊断平台",
      event: "milestone_completed",
      summary: "飞书通知系统已配置完成，这是一条测试消息",
      detail:
        "FeishuWebhookNotifier 模块已部署，支持签名验证、8 类事件推送。",
    });
  }
}
