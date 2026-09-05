import crypto from "crypto";
import { isEmailConfigured, sendMail } from "./mailer";

// 验证码发送通道：邮件走 SMTP（lib/mailer），短信走阿里云 SMS RPC API（手动 HMAC-SHA1 签名，免 SDK）。
// 任一通道未配置时由调用方回退到 dev 行为；生产环境未配置则直接报错，禁止静默降级。

export { isEmailConfigured };

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.ALIYUN_SMS_ACCESS_KEY_ID &&
      process.env.ALIYUN_SMS_ACCESS_KEY_SECRET &&
      process.env.ALIYUN_SMS_SIGN_NAME &&
      process.env.ALIYUN_SMS_TEMPLATE_CODE
  );
}

export async function sendEmailCode(email: string, code: string): Promise<void> {
  await sendMail({
    to: email,
    subject: `登录验证码 / Login verification code: ${code}`,
    text: [
      `您的登录验证码是：${code}，10 分钟内有效。请勿泄露给他人。`,
      `Your login verification code is: ${code}. It expires in 10 minutes. Do not share it with anyone.`,
      `如果您没有请求此验证码，请忽略本邮件。/ If you did not request this code, please ignore this email.`,
    ].join("\n\n"),
  });
}

// ---- 阿里云 SMS（dysmsapi RPC 签名） ----

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

export async function sendSmsCode(phone: string, code: string): Promise<void> {
  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID!;
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET!;

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: process.env.ALIYUN_SMS_REGION_ID || "cn-hangzhou",
    SignName: process.env.ALIYUN_SMS_SIGN_NAME!,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE!,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  };

  const canonicalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonicalized)}`;
  params.Signature = crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  const body = Object.keys(params)
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const res = await fetch("https://dysmsapi.aliyuncs.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as { Code?: string; Message?: string };
  if (!res.ok || data.Code !== "OK") {
    throw new Error(`aliyun sms send failed: ${data.Code ?? res.status} ${data.Message ?? ""}`);
  }
}
