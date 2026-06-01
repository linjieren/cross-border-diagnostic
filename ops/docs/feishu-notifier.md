# FeishuWebhookNotifier 配置说明

## 环境变量

```bash
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
FEISHU_WEBHOOK_SECRET=xxx
```

## 使用方式

```typescript
import { FeishuWebhookNotifier } from "../backend/src/notifiers/FeishuWebhookNotifier";

const notifier = new FeishuWebhookNotifier(
  process.env.FEISHU_WEBHOOK_URL!,
  process.env.FEISHU_WEBHOOK_SECRET!
);

await notifier.send({
  project: "跨境出海诊断平台",
  event: "alert",
  summary: "nginx 配置截断，已自动重启修复",
  detail: "容器内配置文件被截断，重启后恢复 healthy。",
});
```

## 支持的事件类型

- `milestone_completed` — 模块/里程碑完成
- `build_success` / `build_failure` — 构建结果
- `deploy_success` / `deploy_failure` — 部署结果
- `alert` — 故障告警（容器异常、服务不可用）
- `blocked` — 流水线阻塞
- `need_user_input` — 需人工决策

## 测试

```bash
cd ops/scripts
npx tsx test-feishu-notifier.ts
```

或手动调用：

```bash
FEISHU_WEBHOOK_URL=xxx FEISHU_WEBHOOK_SECRET=xxx npx tsx ops/scripts/test-feishu-notifier.ts
```
