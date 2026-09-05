# 前端现状梳理与全球对标调研

> 目标：为「跨境出海诊断平台」（B2B SaaS、诊断报告类工具）的前端改版提供现状基线与可借鉴的对标模式。
> 调研日期：2026-09；范围：`frontend/src` 全部代码 + 8 个全球标杆产品。

---

## 1. 现状摘要

### 1.1 页面结构与用户动线

路由定义在 `frontend/src/App.tsx`，共 4 个页面 + 全局登录弹窗：

| 路由 | 文件 | 核心交互 |
|---|---|---|
| `/` | `pages/Home.tsx` (168 行) | URL + 目标市场下拉（12 个市场）表单，前端校验后 `POST /api/agent/diagnose`，跳转 `/thinking/:sessionId` |
| `/thinking/:sessionId` | `pages/AgentThinkingPage.tsx` (630 行) | 诊断工作台：左 iframe 网站预览 + 右 SSE 实时进度流（6 阶段折叠卡片）+ 顶部进度条；完成后跳转报告页 |
| `/report/:sessionId` | `pages/ReportPage.tsx` (1321 行) | 报告阅读：可拖拽分屏（左网站预览/右报告）、内联目录、顾问聊天抽屉、PDF/HTML 下载菜单、划词引用提问 |
| `/history` | `pages/HistoryPage.tsx` (509 行) | 历史列表：评分卡、状态 chip、骨架屏、详情/删除弹窗、Toast、分页 |
| 全局 | `components/LoginModal.tsx` | 邮箱验证码 + 微信扫码双 Tab 登录（`context/AuthContext.tsx` 管理态） |

动线：首页输入 → 过程页等待（1–3 分钟）→ 报告页阅读/追问/导出 → 历史页回溯。登录非强制，仅历史页要求登录。

### 1.2 关键组件清单

- **左右分屏 + iframe 预览**：`AgentThinkingPage.tsx:467-480`、`ReportPage.tsx:1094-1123`，带 Pointer Events 拖拽分隔条（`handleDividerPointer*`），宽度持久化到 localStorage。
- **SSE 进度流**：`AgentThinkingPage.tsx:360-406`，EventSource 接 `/stream`，2.5s 断线重连 + 4s 轮询兜底；6 阶段卡片（positioning/technical/landing/content/tracking/report）折叠展示，conic-gradient 旋转指示器（`index.css:490-518`）。
- **报告渲染**：`ReportPage.tsx:821-933`，react-markdown + remark-gfm + react-syntax-highlighter；自建 markdown 切分逻辑（`splitReportMarkdown:238`）生成标题/目录/正文；YouTube 链接渲染为视频卡片（`YouTubeCard:324`）。
- **顾问聊天抽屉**：`ReportPage.tsx:1170-1317`，右侧可拖宽抽屉（320–720px）、快捷问题 chip、划词引用（`handleTextSelection:597`）、打字中三点动画。
- **下载菜单**：`ReportPage.tsx:1048-1080`，PDF/HTML 两种格式带生成中状态。
- **历史评分卡**：`HistoryPage.tsx:319-326`，72px 方卡 + 三档配色（≥80 绿 / ≥60 黄 / 其余红）。

### 1.3 设计语言现状

- **样式体系**：Tailwind v4（`@import "tailwindcss"`，无 tailwind.config）+ 手写 CSS 变量主题，集中在 `index.css`（1899 行）的 `--gm-*` 变量。
- **配色**：仿 Google Material 调色板（蓝 `#4285f4`、红 `#ea4335`、黄 `#fbbc05`、绿 `#34a853`），浅灰底 `#f7f9fc`，语义色通过 `gm-chip--*` / `gm-score-card--*` 实现。
- **字体**：`"Google Sans"` 优先、系统字体兜底（`index.css:34-45`）——Google Sans 是 Google 私有字体，绝大多数用户机器不存在，实际渲染为系统字体，与预期不符。
- **圆角/阴影**：偏大圆角（10/16/22px + 大量 pill 999px），柔和阴影两档；风格偏 Consumer 化。
- **动效**：按钮 hover 上浮、阶段指示器旋转、骨架屏 shimmer、滚动平滑；克制度尚可。
- **无暗色模式**；移动端仅有 768/1100px 两处媒体查询（`index.css:1840-1898`）。

### 1.4 现状短板（代码视角）

1. **两套视觉语言并存**：Home/LoginModal 用 Tailwind 默认调色板（`indigo-600`、`blue-600`、`rounded-xl shadow-sm`），过程/报告/历史页用 `--gm-*` 变量体系，首页与后续页面观感断裂；且 `index.css` 里定义了 `.gm-input/.gm-btn` 等整套类但 Home 未使用。
2. **i18n 不完整**：`i18n/config.ts` 配了 4 语言（zh-CN/en/ja/ko），但 `AgentThinkingPage.tsx`（全部 6 阶段标题、状态文案）和 `ReportPage.tsx`（下载菜单、预览按钮、快捷问题）大量硬编码中文，出海产品自身多语言体验自相矛盾。
3. **过程页"实时感"打折**：阶段卡片默认全部折叠，SSE 流式 thinking 内容藏在折叠面板里（`AgentThinkingPage.tsx:569-582`），且仅 step 1/3 接收 thinking 增量（`:267`）；用户在 1–3 分钟等待中主要看到的是静态卡片 + 进度条。
4. **报告页信息层级依赖 markdown 运气**：综合评分只出现在 meta 行文本里，无可视化评分 hero；`report-priority-*`、`report-evidence-*` 等 CSS 已写好但渲染依赖 LLM 输出特定 class，不保证出现；目录无 scroll-spy 高亮。
5. **移动端是半成品**：预览 iframe 在 `<lg` 直接隐藏（过程页）/`<md` 隐藏（报告页），聊天抽屉全屏覆盖，导航无汉堡菜单，报告 `px-8` 内边距偏大。
6. **状态反馈缺口**：Home 提交后仅按钮文字变化，无"创建中→跳转"过渡；报告加载是裸 spinner；无全局 Toast/错误边界；`LoginModal.tsx:66-79` 留有微信扫码 3 秒自动 mock 登录的桩代码。

---

## 2. 对标产品分析

### 2.1 HubSpot Website Grader —— 评分即营销
- **问题**：把"诊断"做成获客钩子，输入 URL 秒出结果。
- **借鉴点**：单一大输入框 + 邮箱门禁的极简入口；总分 100 大字呈现后接 4 个分类分（性能/SEO/移动/安全），每个分类"你在 X 项中通过 Y 项"+ 可展开的修复建议，非技术用户也能看懂。
- 映射：**创建诊断**（极简输入）、**报告阅读**（总分 → 分类分 → 修复项的三层钻取）。
- 来源：[website.grader.com](https://website.grader.com/)、[HubSpot Website Grader Guide](https://consultevo.com/hubspot-website-grader-guide-2/)、[Outgrow 案例](https://outgrow.co/blog/hubspot-website-grader-case-study)

### 2.2 Google PageSpeed Insights / Lighthouse —— 评分的工业标准
- **问题**：技术指标如何让普通人可感知。
- **借鉴点**：四个彩色环形分数（红/橙/绿 + 0-49/50-89/90-100 档位）成为行业事实标准；Core Web Vitals 实测数据（field data）与实验室数据分层展示；每条机会项标注"预计可节省 X s"——**量化收益**；审计算法透明可复现。
- 映射：**报告阅读**（评分环 + 量化影响 + 可展开证据）。
- 来源：[pagespeed.web.dev](https://pagespeed.web.dev/)、[Lighthouse](https://developer.chrome.com/docs/lighthouse)、[PSI vs GTmetrix 对比](https://speedexporter.com/blog/pagespeed-insights-vs-gtmetrix-vs-webpagetest)

### 2.3 Ahrefs / Semrush Site Audit —— 问题-影响-修复的结构化
- **问题**：170+ 技术检查项如何避免淹没用户。
- **借鉴点**：Health Score 单指标 + Errors/Warnings/Notices 三级严重度分组；每个 issue 卡片固定结构"是什么 / 为什么重要(Why it matters) / 怎么修(How to fix) / 受影响页面列表"；按主题（可索引性/性能/链接）聚类；重扫后对比"已修复 N 项"。
- 映射：**报告阅读**（严重度分级、固定 issue 结构、修复前后对比）。本产品报告已有"问题-影响-修复-验证"骨架，可直接对齐此结构。
- 来源：[ahrefs.com/site-audit](https://ahrefs.com/site-audit)、[Ahrefs vs Search Atlas 对比](https://getsearchengine.com/blog/ahrefs-vs-search-atlas/)

### 2.4 GTmetrix / WebPageTest —— 过程与证据可视化
- **问题**：性能诊断的"等待 + 证据呈现"。
- **借鉴点**：测试等待页显示真实浏览器加载截屏流；报告中 A-F 大等级字母 + 瀑布图 + 加载过程视频回放；"Top Issues"按影响排序前置；历史趋势图（多次检测对比）。
- 映射：**过程等待**（截图/进度实况）、**报告阅读**（等级字母、Top Issues 前置、趋势对比）。
- 来源：[gtmetrix.com](https://gtmetrix.com/)、[webpagetest.org](https://www.webpagetest.org/)、[GTmetrix 报告解读](https://wp-rocket.me/blog/gtmetrix/)

### 2.5 Stripe Dashboard —— B2B 信息密度的信任感
- **问题**：高密度数据 + 非技术/技术混合用户。
- **借鉴点**：分层披露（layered disclosure）——首屏只给决策所需，细节收进二级面板；克制的单色系（品牌蓝 + 中性灰），状态色仅用于状态；表格/卡片间距系统极稳定；空状态和错误态文案具体且给下一步动作。
- 映射：**报告阅读**信息层级、整体视觉基调。
- 来源：[Stripe Dashboard 设计拆解](https://www.925studios.co/blog/stripe-dashboard-design-breakdown)、[B2B SaaS Dashboard 案例集](https://www.orbix.studio/blogs/b2b-saas-dashboard-design-examples)

### 2.6 Linear —— 效率感与质感
- **问题**：B 端工具如何"快且高级"。
- **借鉴点**：高信息密度但不拥挤（13-14px 基准字号 + 严格 spacing token）；微动效全部 <200ms 且只在状态变化时出现；深色模式作为一等公民；键盘优先（cmd+K 命令面板）。
- 映射：整体**设计系统**基调（密度、动效克制、token 化）。
- 来源：[Linear 设计方法](https://linear.app/method)、[Linear 设计模式总结](https://lobehub.com/skills/marcus-marcus-skills-linear-design-patterns)

### 2.7 ChatGPT Deep Research / Perplexity —— AI 过程可视化
- **问题**：5-30 分钟 AI 长任务如何留住用户。
- **借鉴点**：侧边"活动面板"实时滚动展示思考步骤/搜索查询/访问来源，步骤可折叠但**默认展开当前步**；进度条 + 已用时 + 来源计数；完成后活动面板自动收起为可回看的摘要；报告正文带引用脚注，可一键导出/分享链接。
- 映射：**过程等待**（本产品最该抄的对象：默认展开运行中阶段、来源/事件计数、完成后自动转场）、**报告阅读**（分享链接）。
- 来源：[OpenAI Deep Research](https://openai.com/index/introducing-deep-research/)、[Perplexity Deep Research](https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research)、[Perplexity vs OpenAI 对比](https://www.clickittech.com/ai/perplexity-deep-research-vs-openai-deep-research/)

### 2.8 Cursor / v0 —— 生成式工作流的即时反馈
- **借鉴点**：流式输出逐字呈现制造"正在干活"的体感；每个工具调用是可折叠的 status block（`Reading file…` ✓）；接受/拒绝 diff 的强 CTA；建议操作（next-action chips）跟在结果后面。
- 映射：**过程等待**（流式细节默认可见）、**追问互动**（追问建议 chip，本产品已实现类似 quickQuestions）。
- 来源：[cursor.com](https://cursor.com/)、[v0.app](https://v0.app/)

---

## 3. 可借鉴交互模式清单（按四大场景）

### 场景一：创建诊断（Home）
- **单框大输入 + 内联校验**：一个 URL 大输入框为绝对主角，市场选择做成 chip 组而非下拉。借鉴：HubSpot Grader / PSI。
- **输入即预览**：粘贴 URL 后立即在输入框旁显示 favicon + 域名确认卡片（"将诊断 example.com"）。借鉴：PSI 分析中的 URL 确认。
- **提交过渡动画**：提交后按钮变进度态 → 整页过渡到工作台，避免"白屏跳转"。借鉴：Stripe 页面转场、v0。

### 场景二：过程等待（AgentThinkingPage）
- **运行中阶段默认展开 + 流式滚动**：当前阶段的 thinking/事件流默认可见、自动滚动，已完成阶段自动折叠。借鉴：Deep Research 活动面板、Cursor status block。**这是全项目 ROI 最高的一改。**
- **总进度 = 阶段进度 + 时间预期**：顶部进度条保留，增加"第 3/6 步 · 已用时 45s · 预计还需 1 分钟"。借鉴：Deep Research。
- **阶段卡片内嵌发现计数**：每完成一模块即显示"3 红 / 2 黄 / 5 通过"迷你分布条（`gm-mini-*` 样式已具备雏形）。借鉴：Ahrefs 三级严重度。
- **左屏 iframe 加加载遮罩与截图降级**：iframe 加载失败/被 X-Frame-Options 拒绝时降级为后端截图。借鉴：GTmetrix 截屏流。
- **完成自动转场**：report-complete 后短暂"完成态"动画自动进入报告页，而非等用户点按钮。借鉴：Deep Research 完成折叠。

### 场景三：报告阅读（ReportPage）
- **评分 Hero 区**：报告顶部固定综合评分环（PSI 三档配色）+ 四模块小分条，替代当前纯文本 meta 行。借鉴：PSI / HubSpot / Ahrefs Health Score。
- **问题卡片固定四段式**：每个问题 = 现象 / 影响（量化：损失多少转化或秒数）/ 修复步骤 / 验证方式，用结构化组件渲染而非依赖 markdown class。借鉴：Ahrefs、PSI"预计节省"。
- **Top 3 优先修复前置**：报告开头给"本周该做的 3 件事"，与正文深度详情分离（分层披露）。借鉴：GTmetrix Top Issues、Stripe 分层。
- **目录 scroll-spy + 阅读进度**：现有内联目录升级为 sticky 侧栏（`report-doc-layout` CSS 已备好未启用），滚动高亮当前节。借鉴：Stripe 文档。
- **分享/导出升级**：生成只读分享链接；PDF 封面带评分 Hero。借鉴：Deep Research 分享、Ahrefs 导出。
- **重测对比**：再次诊断同一 URL 时展示分数变化（82 → 91，已修复 5 项）。借鉴：Ahrefs 重扫对比、GTmetrix 趋势。

### 场景四：追问互动（聊天抽屉）
- **上下文感知建议问题**：现有 quickQuestions 已好，升级为按报告内容动态生成（如"第 2 个严重问题怎么修"）。借鉴：Perplexity 追问建议、ChatGPT follow-ups。
- **回答带报告内引用跳转**：顾问回答中引用报告章节时可点击滚回正文对应位置（正文已有标题锚点 id）。借鉴：Deep Research 引用脚注。
- **回答中嵌入评分/对比小部件**：如"修好后预计 LCP 从 4.2s → 2.1s"渲染为小卡片而非纯文本。借鉴：ChatGPT 内嵌组件、PSI 指标卡。

---

## 4. 设计系统建议

**基调**：专业可信的 B2B 诊断工具 = Stripe 的克制 + Linear 的密度 + PSI 的语义色。

- **配色**：弃用 Google 四色 Material 风格。单一品牌主色（建议保留蓝系 `#4285f4` 或升级为更沉的靛蓝 `#3b5bdb`），中性灰阶做主体；红/黄/绿**只作为诊断语义色**（失败/警告/通过），不出现在装饰位置。以现有 `--gm-*` 变量为基础收敛为 token 层（color/space/radius/shadow 各一档文件）。
- **字体**：去掉不存在的 `"Google Sans"` 声明，中文用系统栈 + 英文用 Inter（或全部系统栈）；基准字号 14px（现状 16px 偏大圆角偏 C 端），报告正文可保持 16px；数字/指标用 tabular-nums 等宽数字。
- **圆角与阴影**：整体降圆角（卡片 8–12px，按钮 6–8px，pill 仅用于 chip），阴影减淡一档——降低 C 端感，增强工具感。
- **信息密度**：工作台/报告页对齐 Linear 式高密度（紧凑行距、12-13px 辅助文本），报告正文保持阅读密度（现状 1.88 行高合理）。
- **动效**：只保留状态反馈动效（进度、旋转、骨架屏），时长 ≤200ms；删除按钮 hover 上浮等装饰性动效。
- **暗色模式**：暂不做（报告阅读类工具浅色更合适，ROI 低），但 token 化时预留结构。
- **一致性**：Home/LoginModal 迁移到统一 token 体系，消除 Tailwind 默认色与 `--gm-*` 并存的双轨制；同步补齐过程页/报告页的 i18n 硬编码中文。

---

## 5. 优先级建议（低成本高回报排序）

| 优先级 | 改造点 | 成本 | 回报 |
|---|---|---|---|
| P0 | 过程页：运行中阶段默认展开 + 流式内容自动滚动 + 完成自动转场（`AgentThinkingPage.tsx` 改折叠默认状态即可） | 低（<1 天） | 直接兑现"实时展示诊断过程"核心卖点 |
| P0 | 报告页：评分 Hero 组件（综合评分环 + 四模块分条），数据已有（历史页已用 overallScore） | 低-中 | 报告第一眼专业度，对齐所有标杆 |
| P0 | 统一视觉双轨：Home/LoginModal 迁入 token 体系 + 删除 Google Sans 声明 | 低 | 消除第一眼观感断裂 |
| P1 | 问题卡片结构化渲染（现象/影响/修复/验证四段组件，替换 markdown 依赖） | 中（需后端输出结构化字段或前端解析约定标题） | 报告可读性、可复制到 PDF |
| P1 | 过程页/报告页 i18n 硬编码中文补齐（4 语言已有基础设施） | 低 | 出海产品自身可信度 |
| P1 | 目录 scroll-spy 侧栏化（`report-doc-layout` CSS 已备好） | 低 | 长报告导航体验 |
| P2 | 移动端适配：聊天抽屉已全屏化，补导航汉堡 + 过程页单列优化 + 截图降级替代 iframe | 中 | 补齐半成品状态 |
| P2 | 重测对比 + 分享链接 | 中-高（需后端配合） | 留存与传播 |
| P2 | 顾问回答引用跳转报告锚点 + 动态建议问题 | 中 | 追问闭环体验 |

