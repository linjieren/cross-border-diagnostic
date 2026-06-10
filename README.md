# Cross-Border Diagnostic

跨境出海诊断平台，用于输入网站 URL 和目标市场后生成网站出海体检报告。项目包含 React 前端、Express/Prisma 后端、PostgreSQL 数据库，以及基于 DeepSeek 的诊断报告生成和顾问问答能力。

## 功能概览

- 网站定位识别：读取页面标题、核心文案和产品表达，判断网站面向对象与价值主张。
- 出海诊断报告：覆盖全球加速、落地页检查、产品内容审核、表单追踪等模块。
- 过程页展示：展示每个诊断阶段的状态、发现和失败原因。
- 顾问问答：围绕报告内容继续追问优化建议。
- 报告下载：支持导出独立 PDF 和 HTML 报告，不包含前端工作台、网站预览或聊天抽屉。
- 本地开发脚本：一条命令同时启动后端和前端。

## 技术栈

- Frontend: React, Vite, TypeScript, Tailwind CSS, React Markdown
- Backend: Node.js, Express, TypeScript, Prisma
- Database: PostgreSQL
- AI Provider: DeepSeek compatible chat API
- PDF Export: Playwright

## 项目结构

```text
.
├── backend/                 # Express API, Prisma, agent workflow
├── frontend/                # React/Vite frontend
├── docs/agent-prompts/      # Agent prompt and workflow documentation
├── ops/                     # Docker deployment assets
├── scripts/                 # Local development and verification scripts
├── tests/                   # Test configuration
├── docker-compose.yml       # Local Docker stack
├── package.json             # Root convenience scripts
└── .env.example             # Local environment template
```

## 环境变量

复制 `.env.example` 到 `.env`，再填入本地值：

```bash
cp .env.example .env
```

关键变量：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Prisma/PostgreSQL 连接地址 |
| `PORT` | 后端服务端口，默认 `3011` |
| `FRONTEND_PORT` | 前端 Vite 端口，默认 `5175` |
| `API_PROXY_TARGET` | 前端代理到后端的地址 |
| `JWT_SECRET` | 登录态签名密钥，本地可用占位值，生产必须替换 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key，必须只放在本地 `.env` 或部署平台密钥管理中 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址，默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名称，默认 `deepseek-chat` |

## 本地启动

安装依赖：

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

启动 PostgreSQL：

```bash
docker compose up -d db
```

生成 Prisma Client 并执行迁移：

```bash
npm --prefix backend run db:generate
npm --prefix backend run db:migrate:dev
```

启动前后端：

```bash
npm run dev
```

默认访问地址：

- Frontend: `http://127.0.0.1:5175`
- Backend: `http://127.0.0.1:3011`

## 常用命令

```bash
npm run build
npm run build:backend
npm run build:frontend
npm run dev:backend
npm run dev:frontend
```

## 安全注意事项

- `.env` 和 `.env.*` 默认被 Git 忽略，真实 API Key 不应提交到仓库。
- 提交前建议执行敏感信息扫描，重点检查 `DEEPSEEK_API_KEY`、`JWT_SECRET`、第三方 webhook、token 和 cookie。
- `.env.example` 只能保留占位符，不能写入真实密钥。
- 生产环境必须替换默认 `JWT_SECRET` 和数据库密码。
- 诊断过程会访问用户输入的网站 URL，部署时需要评估 SSRF、防火墙和请求超时策略。

## 报告导出说明

报告页的下载能力由后端生成：

- `GET /api/agent/diagnose/:sessionId/report/pdf`
- `GET /api/agent/diagnose/:sessionId/report/html`

这两个接口使用同一份报告正文和独立报告模板，避免把前端页面框架、网站预览 iframe、下载菜单或顾问聊天区域导出到报告文件中。

## 许可

当前仓库未声明开源许可证。发布到公开仓库前，请确认是否需要添加许可证文件。
