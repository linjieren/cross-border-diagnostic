# 反馈对接契约 · 与开发线的接口约定

## 现状

开发线已实现 FastAPI 后端的反馈接收 API，不再使用文件交换方式。

## 反馈 API（开发线提供）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/feedback` | GET | 分页拉取反馈列表，支持 `since`、`limit`、`cursor` |
| `/api/feedback/{id}` | GET | 单条反馈详情 |
| `/api/feedback` | POST | 用户提交反馈（multipart/form-data） |
| `/api/uploads/{filename}` | GET | 获取截图文件 |

### GET /api/feedback 响应格式

```json
{
  "items": [
    {
      "id": "fbk_abc123",
      "content": "反馈文字内容",
      "type": "bug",
      "severity": "critical",
      "screenshot_path": "uploads/screenshot_abc.png",
      "page_url": "/checkout",
      "app_version": "1.2.3",
      "platform": "iOS",
      "user_agent": "iPhone 15 / iOS 18.0",
      "created_at": "2026-05-30T10:00:00Z"
    }
  ],
  "next_cursor": "fbk_def456",
  "total": 128
}
```

## 收集管道（我提供）

- **适配器**：`feedback/fastapi_source.py` — 实现 FeedbackSource 接口，对接上述 API
- **评估引擎**：`scratch/pipeline/assessment.py` — 分类、打分、去重
- **管道主流程**：`scratch/pipeline/main.py` — 编排收集→评估→报告

## 运行流程

1. 我通过 heartbeat（request_wake_at）周期性唤醒
2. 调用 FastAPIFeedbackSource.fetch(since=last_run) 拉取新反馈
3. AssessmentEngine 评估：分类、打分、去重
4. 生成 AssessmentReport
5. 如有高优先级反馈（score >= 70），通过 message_sibling 或 notify_parent 推动开发线处理
6. 报告持久化到 feedback/reports/

## dev 部署配置

dev 版本通过 `FEATURE_FEEDBACK_BUTTON=true` 启用反馈按钮，nginx 对外端口 `${DEV_PORT:-8081}`。
