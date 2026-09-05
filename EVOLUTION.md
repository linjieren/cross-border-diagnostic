# EVOLUTION.md — 跨 session 进度档案

## 用途与更新规则（务必阅读）

- **每次 session 开始时**：先读本文件 + `product/BACKLOG.md`，再开始任何工作。
- **每次完成重要变更后**：必须更新本文件——
  1. 在「变更日志」顶部追加新条目（日期 / 摘要 / 涉及路径）；
  2. 同步刷新「当前状态」（完成度、差距清单）；
  3. 如有变化，更新「下一步计划」和「已知问题与风险」。
- 保持简洁：本文件记录状态与方向，不堆砌代码细节（细节看代码与 spec）。

---

## 项目快照

- **一句话定位**：为跨境出海企业提供网站诊断的 AI 平台——输入网站与目标市场，自动执行四大模块检测，生成结构化诊断报告并支持顾问追问。
- **技术栈**：React 18 + Vite + TS（前端）/ Express + Prisma + PostgreSQL（后端）/ DeepSeek API（报告生成与顾问问答）/ Playwright（页面抓取与 PDF 导出）/ Docker Compose + Nginx（部署）。
- **当前版本阶段**：对照 `docs/project-formal-proposal.md`，**v0.1 MVP 已完成**（git tag v2.2，对应 proposal 第 5 节成果全部落地）；**即将进入第一阶段「产品闭环补齐」**（proposal 第 9 节里程碑）。

---

## 当前状态

### 已完成能力

- 核心诊断流程：`backend/src/agent/orchestrator.ts` 编排四模块检测（`tools/globalAccelerationTool.ts` / `leadPageTool.ts` / `productContentTool.ts` / `formTrackingTool.ts`），底层检测逻辑在 `backend/src/lib/modules/`（global-acceleration、lead-page-check、product-content-audit、form-tracking、crawler）。
- Agent 接口：`backend/src/routes/agent.ts` —— `POST /diagnose`、SSE 进度流 `/diagnose/:id/stream`、报告 JSON/PDF/HTML、顾问问答 `/consultant/:id/chat` 与历史。
- 报告生成：`backend/src/agent/reportGenerator.ts`（DeepSeek 结构化报告）、`pdfGenerator.ts`（Playwright PDF 导出）。
- 独立诊断路由：`backend/src/routes/diagnostic.ts`（早期四模块直查流程，与 agent 流程并存，属 legacy）。
- 登录闭环（部分）：邮箱/手机 magic-link 验证码（`routes/auth.ts`，JWT cookie）+ 微信扫码登录/绑定/解绑（`routes/wechat.ts`）。
- 诊断历史（部分）：前端 `frontend/src/pages/HistoryPage.tsx` 已存在，可按用户列出历史诊断会话。
- 多语言（部分）：前后端 i18n 均有 zh-CN / en / ja / ko 四套 locale（`*/src/i18n/locales/`）。
- 通知：飞书 Webhook 通知器 `backend/src/notifiers/FeishuWebhookNotifier.ts`。
- 部署资产：`ops/` 下 docker-compose 三套 + nginx 配置；`tests/` 下 e2e / integration / unit（Playwright）。

### 模块完成度（对照 BACKLOG v0.1 四大模块）

| 模块 | 状态 | 说明 |
|---|---|---|
| MOD-001 全球加速 | ✅ 已实现（draft spec） | 单节点检测，未接全球测速 API |
| MOD-002 留资页检查 | ✅ 已实现（draft spec） | 表单/HTTPS/蜜罐等检查 |
| MOD-003 产品内容 | ✅ 已实现（draft spec） | 信任要素/参数/FAQ 等内容审计 |
| MOD-004 表单追踪 | ✅ 已实现（draft spec） | GA4/Pixel/UTM 等追踪检测 |

> 注：BACKLOG 中四大模块仍标 draft，但代码均已实现并通过 MVP 验收；B 系列（反馈系统）已归档，见 `feedback/` 与 BACKLOG 归档区。

### 当前差距（对照 proposal 第 6 节）

| 方向 | 状态 | 差距 |
|---|---|---|
| 诊断历史 | ✅ 已闭环 | HistoryPage 按 URL 分组 + 分差趋势 + 对比弹窗 + 重新诊断入口（2026-09-04）；缺报告分享链接 |
| 登录闭环 | 🟡 部分 | magic-link + 微信登录已有；**验证码仅打日志，未接真实邮件/短信网关**；缺用户中心；`WeChatQRModal.tsx:54-66` 仍有一份 3 秒 mock 自动登录桩待清理 |
| 邮件通知 | ❌ 未做 | 无 SMTP/邮件服务集成，只有飞书 webhook |
| 多语言 | 🟡 部分 | 4 语言 UI 框架在；报告内容与本地化建议的完整度未验证 |
| 全球测速 | ❌ 未做 | 仍单节点，未接第三方性能 API（TECH-BOUNDARY 列了备选） |
| 行业模板库 | ❌ 未做 | 报告建议较通用，无 B2B/DTC/SaaS 差异化模板 |
| 管理员后台 | ❌ 未做 | 无运营指标看板 |
| 商业化 | ❌ 未做 | 无付费/配额/批量诊断能力 |

---

## 变更日志（倒序）

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-09-04 | 前端体验改造 P0 批次 | ①过程页：运行中阶段默认展开+流式自动滚动+完成自动折叠（AgentThinkingPage）；②报告页：评分 Hero（SVG 评分环+三档语义色）、Top Issues 前置、问题卡片、动态 quickQuestions+章节锚点（ReportPage + 新建 components/report/，后端报告接口新增 `insights` 字段，见 `backend/src/agent/reportInsights.ts`）；③历史页：按 URL 分组+分差趋势+对比弹窗+重新诊断入口（HistoryPage）；④视觉统一：Home/LoginModal 迁入 `--gm-*` 体系、删除 Google Sans、删除微信登录 3 秒 mock 桩（LoginModal）、过程页硬编码中文全部迁入 i18n（四语言）。研究依据：`docs/frontend-benchmark-research.md` |
| 2026-09-04 | 商业研究建档 | `docs/business-plan-research.md`：结论——诊断是 vitamin 非 painkiller，建议转向 B2B2B（服务商获客钩子+提效工具），首个场景打「广告落地页承接体检」；90 天计划：服务商试点 / 单行业做深+盲测 / ¥99 landing page 付费实验 |
| 2026-09-04 | 创建 EVOLUTION.md | 建立跨 session 进度档案机制 |
| 2026-06-10 | Improve diagnostic report workflow (`81e738c`) | 诊断报告工作流改进（含 HistoryPage 等） |
| 2026-06-01 | Remove hardcoded DeepSeek API key (`7ba057b`) | 移除 docker-compose 中硬编码密钥 |
| 2026-06-01 | Initial commit v2.2 (`09e1f3c`) | MVP 全量代码入库 |

---

## 下一步计划（按优先级）

### 短期（第一阶段：产品闭环补齐，对照 proposal §9.1）

1. **接通真实验证码发送**：邮件（SMTP/SES）与短信网关，替换 `routes/auth.ts` 中"仅打日志"的 dev 实现（生产硬阻塞）。
2. **诊断完成邮件通知**：报告摘要 + 下载链接自动发送（依赖第 1 项）。
3. **清理 `WeChatQRModal.tsx` 残留的 mock 登录桩**；补齐视觉统一后的端到端走查（需 DB 环境）。
4. **商业验证优先于功能堆砌**（见 `docs/business-plan-research.md`）：服务商试点 10-15 家 → 单行业规则库+盲测 → ¥99 landing page 付费实验。

### 中期（第一~二阶段过渡）

4. 用户中心（管理历史诊断、报告文件、账号绑定）。
5. 报告分享链接（先做权限/隐私策略）。
6. 接入全球测速 API 或第三方性能数据，提升 MOD-001 可信度（proposal §6.4）。

### 中长期（第二~三阶段）

7. 行业模板库与目标市场规则库（B2B/DTC/SaaS 差异化建议）。
8. 管理员后台（诊断量、失败率、市场分布等指标）。
9. 商业化试点：批量诊断 / API 调用 / 按次或订阅模式。

---

## 已知问题与风险

- **验证码发送为 dev 桩**：`auth.ts` 明确注释 "In production, the code MUST be sent via a real SMS/email gateway"——上线前必须解决。
- **内存态存储**：验证码 codeStore、微信 stateStore 均为进程内存 Map，重启丢失、不支持多实例（代码注释建议换 Redis）。
- **REMEDIATION-REPORT.md 摘要**（`product/requirements/REMEDIATION-REPORT.md`）：针对真实客户 lightmind.art 的整改方案 spec——设计了一套独立的整改报告数据结构（模块评分、findings、recommendations 含 ROI 与部署代码、D30/D60/D90 路线图），建议用 Next.js + shadcn + window.print() 导出，长期目标是 backend 提供 `POST /api/remediation-report` 数据 API。尚未实现，可作为"报告产品化"方向参考。
- **技术边界要点**（`product/requirements/TECH-BOUNDARY.md`）：iframe 预览受 X-Frame-Options 限制需降级提示；抓取须用无头浏览器（SPA/robots）；外部请求一律走后端代理规避 CORS；全站四模块诊断预估 15-45 秒；部署代码建议需按建站平台（WordPress/Shopify/Wix/自建）分别说明。
- **架构审查结论（2026-09-04，详证据见各审查 agent 汇报）**：
  - P1 级 bug：`tools/globalAccelerationTool.ts:8-17` no-cors 导致 CDN/HTTP2/缓存三项检测恒误判；报告模板中"CDN 部署代码"实为 Cloudflare Web Analytics 脚本（内容性错误）。
  - 评分口径三套并存：`reportGenerator.moduleScore`（100/65/35）vs `diagnostic.ts:1543` 回退（100/60/20）vs legacy 规则分——历史对比功能跨会话不可信，需抽唯一 scoring 模块。
  - LLM 故障策略：仅缺 key 走降级，超时/500 杀死整个会话；60s 超时对 8192-token 报告偏紧；报告过两道 LLM（生成+润色）成本翻倍。
  - 资源与安全：单次诊断 5 个 Chromium 无并发闸；nginx 缺 `proxy_buffering off` 会缓冲 SSE；SSRF 未拦内网段/云元数据，截图抓取端点无鉴权无限流。
  - 伪检测项：UTM 恒 warn、HTTPS 恒 pass、"全球加速"未接 targetMarket、客户背书关键词误判。
  - 架构债：双路由并存（diagnostic.ts 1688 行中约 1400 行死路由，仅 history/delete 活着）；agent 端点零鉴权；进程内存 Map 与已 provision 的 Redis 脱节（ioredis 零引用）；DB 缺索引；无 CI。
  - 文档：`docs/agent-prompts/02` 与代码有 8 处漂移（polishReportDraft 完全未写）；BACKLOG 状态误导；`feedback/` 为死代码应整体归档；REMEDIATION-REPORT.md 放错位置；4 套 compose 分工无文档。
  - 改进优先级：修 no-cors → 统一计分 → nginx SSE → SSRF 收口 → 收敛双路由删 legacy → 补索引+CI。报告长期方向：代码拼装骨架 + LLM 只写叙述段落。
- **proposal §8 风险**：诊断结果偏通用（缺行业深度）、Token 成本、单节点测速不准、客户数据安全、商业化路径未验证——均有对应应对策略，见原文件。

---

## 给下一个 session 的 AI 助手指引

1. **开始工作前**：先读本文件和 `product/BACKLOG.md`；涉及具体模块再读 `product/requirements/` 下对应 spec。
2. **判断任务归属**：参照「当前差距」和「下一步计划」确认任务在路线图中的位置。
3. **完成变更后**：按文件头部的更新规则更新本文件（追加变更日志 + 刷新状态与下一步）。
4. 旧反馈系统（`feedback/`、B 系列需求）已归档，除非明确要求，不要在上面投入工作。
