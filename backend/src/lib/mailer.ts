import nodemailer from "nodemailer";

// 通用 SMTP 发信通道（验证码、报告通知等共用）。
// 未配置 SMTP_HOST/SMTP_FROM 时 isEmailConfigured() 为 false，由调用方决定降级策略。

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendMail(options: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({ from: process.env.SMTP_FROM, ...options });
}
