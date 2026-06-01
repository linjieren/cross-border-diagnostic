import { FeishuWebhookNotifier } from "../../backend/src/notifiers/FeishuWebhookNotifier";

const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL ?? "";
const SECRET = process.env.FEISHU_WEBHOOK_SECRET ?? "";

if (!WEBHOOK_URL || !SECRET) {
  console.error("Missing FEISHU_WEBHOOK_URL or FEISHU_WEBHOOK_SECRET");
  process.exit(1);
}

const notifier = new FeishuWebhookNotifier(WEBHOOK_URL, SECRET);

async function main() {
  console.log("Sending test notification...");
  const result = await notifier.sendTest();
  console.log("Result:", JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

main();
