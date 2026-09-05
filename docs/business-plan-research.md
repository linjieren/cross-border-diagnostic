# 跨境出海诊断平台 · 商业计划与产品设计研究

> 日期：2026-09-04
> 范围：验证「真实需求、市场空间、商业模式」三个核心问题，并给出当前阶段优化方案。
> 方法：项目内部叙事梳理（proposal / BACKLOG / EVOLUTION / TECH-BOUNDARY）+ 公开市场数据与竞品调研（来源附 URL；找不到可靠来源的标注"未能验证"）。

---

## 一、项目自身的商业叙事（内部文档梳理）

来源：`docs/project-formal-proposal.md`、`product/BACKLOG.md`、`EVOLUTION.md`、`product/requirements/TECH-BOUNDARY.md`。

### 1.1 声称的目标客户

- 准备出海或正在海外获客的企业：B2B 外贸、DTC 品牌、SaaS 出海（proposal §1）。
- 次要用户：跨境业务团队的"运营/顾问"，即服务商侧（proposal §2.1 "提升顾问效率"）。

注意：proposal 内部存在双重客户叙事——既是"给终端出海企业的工具"，又是"给服务商/顾问的提效工具和获客入口"。这两者的商业模式、定价、获客路径完全不同，目前文档未做取舍（见 §四判断）。

### 1.2 声称的付费模式

按 proposal §2.2 与 §6.5，列出五种：按次诊断、订阅、批量诊断、API 调用、定制报告；外加"诊断→建站/广告/SEO/数据追踪服务"的服务转化（§2.1、§3.3）。即"所有模式都列了，没有下注"。

### 1.3 声称的增长路径

低门槛诊断承接潜在客户 → 诊断报告建立信任 → 转化为建站/广告/SEO/追踪等高客单价服务（诊断即 lead magnet 漏斗）。这条路径隐含一个前提：项目方或其合作方具备服务承接能力，否则漏斗在第二层断裂。

### 1.4 声称的差异化

- LLM + 确定性检测工具编排（可控、可复现）；
- 跨境业务规则与行业知识库（"沉淀行业方法论"）；
- 过程可视化（实时诊断过程页）与报告产品化（PDF/HTML 导出）；
- 面向目标市场的本地化判断（隐私合规、支付习惯等，尚未实现）。

---

## 二、市场验证

### 2.1 市场规模：大盘很大，但"网站诊断"可切到的蛋糕很小

| 指标 | 数据 | 来源 |
|---|---|---|
| 中国跨境电商市场规模 | 2025 年 18.68 万亿元，同比 +5.77%（2024 年 17.66 万亿） | [网经社《2025年度中国跨境电商市场数据报告》](https://tidenews.com.cn/tmh_news.html?id=6a0ef62a3854770001780045) |
| 海关注册跨境电商企业 | 78,811 家（截至 2024-06，+20.81%） | [亿欧/海关数据汇总](https://yixiaoai.com/post/dynamics-of-chinas-cross-border-e-commerce-2025/) |
| 出口电商关联企业/活跃店铺 | 2025 年销售额 2.84 万亿、关联企业 75.9 万个、活跃店铺 256.3 万个 | [商指针报告（网经社转载）](https://www.100ec.cn/detail--6656579.html) |
| 独立站卖家数量 | 约 10–12 万（2022，Shoplus 研究）；店匠自称 25 万活跃商家（2025，平台自报，可信度存疑） | [globelinkholding](https://www.globelinkholding.com/article/2.html)、[digitalmarket.world](https://digitalmarket.world/content/global-mining/65_SaaS%E7%8B%AC%E7%AB%8B%E7%AB%99%E5%AF%B9%E6%AF%94.html) |
| 跨境 ERP 渗透率参照 | 店小秘 180 万注册用户、覆盖 34.8% 跨境用户（沙利文 2024） | [店小秘官网](https://www.dianxiaomi.com/blog/article/448) |
| 中国出海民企 | 超 12 万家（截至 2024） | [《中国民营企业出海发展报告(2025)》](https://segg.sh.gov.cn/zxfw/xwzx/20250929/7efbc81c5ff946749cc156ab248d1745.html) |

**解读**：大盘（跨境电商 18 万亿、出海企业 12 万+）与产品可及市场（SAM）之间隔了两层漏斗：① 有独立站/自有官网的（独立站卖家仅约 10–12 万量级，B2B 外贸官网数量未能验证）；② 愿意为"诊断"这个动作付费的。真正的 SAM 更可能是**数万级企业 × 百元~千元级客单价**，即千万~低亿级人民币/年的小市场——对独立 SaaS 而言偏小，但对一家服务商的获客/交付工具而言完全够用。

另一个必须直面的结构性事实：2025 年前 10 个月新注册跨境电商企业同比 +194.1%，但**超 50% 新卖家难以维持半年**（[出海网](https://m.chwang.com/daily/20251211)）。用户基数在涨，但最庞大的新增人群是低存活、低付费能力的小白卖家——他们不是付费客户，是免费工具的流量。

### 2.2 需求真实性：vitamin，不是 painkiller

目标用户今天在用什么替代方案、花多少钱：

| 替代方案 | 价格 | 证据 |
|---|---|---|
| 免费工具：PageSpeed Insights / Lighthouse / HubSpot Website Grader / 各类免费 SEO 检测 | 0 元 | [HubSpot Grader 已评分 400 万+ 网站](https://b2bgrowthhacking.com/teardowns/hubspot-website-grader)；[询盘云向外贸用户推荐免费检测工具](https://www.leadscloud.com/waimaodulizhanyunan/) |
| SEO 审计套件：Ahrefs / Semrush | $99–140/月起 | [growfore 对比](https://growfore.com/semrush-vs-ahrefs/)、[SE Ranking 对比](https://seranking.com/blog/ahrefs-vs-semrush/) |
| 外贸服务商"免费诊断"钩子 → 代运营/建站/SEO 服务 | 诊断 0 元；代运营服务费 3,000–15,000 元/月；B2B 海外营销公司基础服务费 1–5 万元/月 | [若聚凡星"先做一次免费诊断"](https://ruojufanxing.com/solutions/b2b-seo/)；[博客园行业 FAQ](https://www.cnblogs.com/htyjz/p/19998317)；[大数跨境](https://m.10100.com/encyclopedia/explain/149238156) |
| 外贸建站（问题最终被解决的地方） | 模板 5,000–20,000 元；定制 2–10 万元 | [网易外贸通](https://waimao.163.com/knowledge/article/1341)、[easiwin](https://easiwin.com/how-to-choose/) |
| 通用 LLM：直接把网站截图/URL 丢给 ChatGPT/DeepSeek 问优化建议 | ~0 元 | 无需来源，2026 年用户默认行为 |

关键判断：

- **"发现网站有问题"本身不产生付费**——所有主流玩家都把诊断做成免费钩子（HubSpot Grader 是教科书案例：免费工具换来 400 万+ 网站评分、约 4 万个外链和持续线索）。诊断是经典的 vitamin。
- **付费发生在"解决问题"环节**：建站、代运营、广告投放、SEO——这些是外贸企业常年 1–5 万/月的真实预算（painkiller）。诊断报告如果不连着服务承接，恰好停在用户不付钱的那个位置。
- **痛点强度分层**：对正在投放广告、月烧几万广告费却转化差的企业，"落地页/追踪诊断"接近 painkiller（每浪费 10% 广告费都是真金白银）；对还没投放、网站没流量的企业，整套诊断都是 vitamin。

### 2.3 竞争格局：三层夹击

**第一层：免费 grader/审计工具（上方挤压）**。HubSpot Website Grader、PageSpeed Insights、Ahrefs/Semrush 的 Site Audit（170+/140+ 检查项）已覆盖性能、SEO、移动适配、安全等"事实检测"维度，且品牌与 SEO 流量极强。本平台四模块中"访问与加载体验""表单追踪"的检测项与它们高度重叠。

**第二层：服务商的免费诊断（同位竞争）**。外贸 SEO/建站/代运营公司普遍把"免费网站诊断"当获客钩子（若聚凡星即一例），诊断由人工顾问做，虽然慢但附带真人信任感，且诊断后直接接服务报价——商业闭环已经完整。

**第三层：通用 LLM 与 AI 建站平台（下方侵蚀）**。AI 建站平台（店匠/SHOPLINE 等）自带优化建议；用户把 URL 丢给 ChatGPT/DeepSeek 也能得到七成的通用建议。国外已出现 SavageAudit、LeakAudit 等 AI 审计工具（[SavageAudit 对比文](https://savageaudit.com/blog/best-ai-website-audit-tools)、[LeakAudit 对比页](https://leakaudit.app/compare/leakaudit-vs-hubspot-website-grader)），说明"AI 网站审计"这个品类 2026 年正在快速拥挤化，窗口期不长。

**"免费工具已覆盖的部分凭什么收费？"**——答案只能是免费工具给不了的三样：① 跨境行业语境（B2B 询盘场景、目标市场合规、广告承接视角）；② 前后对比与持续追踪（历史数据资产）；③ 服务承接闭环（诊断→整改→验证）。如果这三样做不出来，收费不成立。

### 2.4 付费意愿证据：钱在订阅制工具和服务费，不在"单次诊断"

- 跨境 ERP：店小秘免费版 + VIP 2,016–9,888 元/年（[店小秘](https://www.dianxiaomi.com/blog/article/455)）；领星按模块/坐席订阅（[领星帮助中心](https://www.lingxing.com/help/article/amazonerphowmuch)）。结论：跨境卖家对"日常经营刚需工具"接受年订阅 2,000–10,000 元。
- 外贸 CRM/营销 SaaS：孚盟基础 10 人版约 2 万元/年（[amz123](https://m.amz123.com/ask/9hCRqrqr)）。
- 外贸智能建站+营销：易营宝 19,800–42,800 元/年（[eyingbao](https://www.eyingbao.net/NEWS/ZIYUANZHONGXIN/AI_JIANZHANXUEYUAN/ZHINENGJIANZHANSHIHEWAIMAOQIYEMA_KANZHE12JIAB2BCHUKOUSHANGRUHEYONGTATISHENGXUNPANZHUANHUALYU.html)）。
- 代运营：3,000–15,000 元/月。
- "诊断免费 + 服务收费"是行业已验证的主流 lead-gen 模式（HubSpot、各家外贸服务商）。

**没有检索到任何一家面向终端外贸企业的"付费网站诊断 SaaS"存活案例**——这个品类的独立收费模式未能验证，这本身就是最强的负向证据。

---

## 三、核心判断与优化方案

### 3.1 定位判断：独立付费 SaaS 不成立；应定位为"服务商获客+交付提效工具（B2B2B）"

**明确结论：当前"面向终端出海企业的独立付费 SaaS"叙事证据不足，不成立。**依据：

1. 诊断环节全行业免费（HubSpot、服务商、AI 工具），没有终端付费先例；
2. 终端中小外贸企业存活率低、付费意愿集中在"能带来询盘的服务"而非"建议报告"；
3. 通用 LLM 已能满足七成"问问建议"的需求，按次收费的价格锚点趋近于零。

**应收窄为：面向外贸服务商（代运营、建站公司、SEO/广告代理）的销售工具 + 交付提效工具**。理由：

- 服务商有明确付费能力（孚盟 2 万/年、易营宝 2–4 万/年的客户就是他们）；
- 诊断工具直接命中他们的两个刚需：**获客**（把免费诊断做成自动化的线索入口，替代顾问手动写初步分析）和**交付提效**（顾问人均可服务客户数提升）；
- proposal §2.1 其实已写出这条路（"可作为跨境服务入口""提升顾问效率"），只是没有下注。

次级定位（如暂无服务商资源）：把产品做成**完全免费的 lead magnet**（对标 Website Grader），为背后的建站/诊断整改服务或 REMEDIATION-REPORT 中设想的整改交付引流——但前提是有服务承接方。

### 3.2 目标用户收窄：先打 B2B 外贸服务商的"广告承接诊断"场景

四模块对应的付费意愿强度（结合 §2.2 痛点分层）：

| 模块 | 最强付费人群 | 付费意愿 |
|---|---|---|
| 落地页转化 + 表单追踪 | 正在投 Google/Meta 广告的 B2B 外贸企业及其广告代理 | ★★★★（广告费浪费 = 直接金钱损失，最接近 painkiller） |
| 访问与加载体验 | 所有有海外站的，但被 PageSpeed/GTmetrix 免费覆盖 | ★★（必须接全球测速节点才有差异化） |
| 产品与合规内容 | DTC 品牌、B2B 新品上线前 | ★★★（行业模板做深后有价值） |

**建议先打人群**：服务 20–200 家客户的外贸代运营/广告代理商；**先打场景**："广告落地页承接体检"——客户广告花了钱没询盘时，代理商用它 5 分钟产出专业的承接诊断报告，既留住老客户又作为新客开发钩子。

### 3.3 商业模式建议：B2B 订阅为主，终端免费/按次仅作获客实验

| 模式 | 判断 | 定价参考 |
|---|---|---|
| B2B 订阅（服务商） | **主模式**。对标孚盟/店小秘价格带 | 基础版 ¥499–999/月（不限坐席、限诊断量）；专业版 ¥2–3 万/年（白标报告、批量诊断、API） |
| 白标/贴牌 | 强加分项——服务商需要以自己品牌给客户出报告 | 含在专业版，或单独 +¥1 万/年 |
| 终端按次付费 | 仅作 90 天付费意愿验证实验，不作为主模式 | ¥99–199/次，landing page 测试 |
| 终端订阅 | 不成立（诊断是低频动作） | — |
| 服务转化分成 | 有服务承接方时成立 | 诊断免费，转化建站/代运营单（客单 2–10 万）抽成或自营 |

模型成本测算参考：DeepSeek 单次完整诊断（理解+四模块报告+问答）token 成本在元人民币个位数量级，对 B2B 定价无压力；真正约束是获客成本而非模型成本。

### 3.4 护城河：哪些成立、哪些不成立

**不成立的声称**：

- "LLM + 工具编排架构"——可复制，不是护城河；
- "过程可视化/报告产品化"——体验优势，竞品一个季度可抄；
- "多语言"——是功能不是壁垒。

**有条件成立的**：

- **跨境行业知识库/规则库**（B2B 询盘场景、各行业信任要素、目标市场合规）：成立，但当前为空（EVOLUTION.md 明确"行业模板库 ❌ 未做，报告建议较通用"），需要真实客户案例冷启动——这是未来 90 天最该开始积累的资产；
- **前后对比数据资产**（诊断→整改→复查的历史纵向数据）：成立，免费 grader 都不做纵向追踪，且它直接支撑"复查"这个留存钩子；
- **检测工具链的事实层**（全球测速、追踪代码实抓、表单实测提交）：半成立——工程壁垒不高，但"确定检测 + LLM 解读"的组合产出比纯 LLM 幻觉建议可信，对服务商的专业形象有价值；
- **服务承接闭环**：最硬的护城河，但属于商业模式而非产品，且当前项目不具备。

### 3.5 关键风险排序（按致命程度）

1. **免费替代 + 通用 LLM 稀释（致命）**：价值主张被 PageSpeed/Website Grader/ChatGPT 三面夹攻。验证方法： concierge MVP——给 5 家服务商的客户免费出报告，同时让对方也跑一遍免费工具和 ChatGPT，对比"哪份报告更愿意发给客户/更愿意照着改"。
2. **诊断结果太通用（致命）**：报告像通用建议则一切免谈。验证方法：选 1 个行业（如机械类 B2B）做深模板库，盲测 10 份报告，让 3 个行业顾问打分"专业/通用"，专业率 ≥7/10 才过关。
3. **获客成本与流量入口缺失（高危）**：产品无自带流量，B2B 获客靠投放或渠道。验证方法：landing page + 小额投放（¥3–5k），测"免费诊断"留资成本和按次付费转化率；留资成本 >¥150 或付费转化 <1% 则终端路线证伪。
4. **服务承接缺失（高危，定位相关）**：若走 lead-gen 却无服务方，漏斗断裂。验证方法：90 天内签下 1 家服务商合作即为部分证真。
5. **模型成本（低危）**：DeepSeek 单价低，限额+缓存即可控。
6. **单节点测速不准（中危，工程问题）**：接第三方测速 API 可解，非商业验证瓶颈。

### 3.6 未来 90 天行动建议（按优先级）

1. **服务商付费试点（验证假设：B2B2B 定位成立）**。约谈 10–15 家外贸代运营/建站/SEO 服务商，展示产品，争取 1–2 家签 3 个月试点（¥499–999/月或免费换深度反馈）。成功标准：≥1 家付费或书面付费意向；≥3 家明确说出"会在获客/交付流程里用"。**这是最高优先级——它同时验证定位、付费意愿和获客渠道。**
2. **单行业做深 + 盲测（验证假设：报告专业度可超越免费替代）**。选机械/工业品类 B2B，把内部案例、行业页面模板、询盘转化经验灌成规则库，输出 10 份真实网站报告做盲测。成功标准：行业顾问盲评"专业"率 ≥70%，且明确优于 ChatGPT 通用回答。
3. **Landing page 付费实验（验证/证伪假设：终端按次付费）**。做一个"¥99 出海体检"落地页 + 小额投放。成功标准：付费转化率 ≥2% 则保留终端入口；<1% 则果断放弃终端收费，全面转向 B2B。此实验目的是低成本证伪，不要恋战。
4. **前后对比与复查钩子（验证假设：数据资产带来留存）**。完成"重新诊断 + 前后对比"（EVOLUTION.md 短期计划第 3 项），配合诊断完成邮件通知。成功标准：试点用户 30 天内复查率 ≥30%。
5. **打通真实验证码与邮件通知（上线前置硬阻塞）**。当前验证码仅打日志，任何真实试点都依赖它（EVOLUTION.md 短期计划第 1、2 项）。这是工程项而非假设验证，但阻塞一切。

不建议 90 天内做：多语言扩展、管理员后台、API 开放平台、全球测速自建——都不服务于上述假设验证。

---

## 四、结论摘要

- **市场空间**：跨境电商大盘 18.68 万亿元、出海企业 12 万+，但"网站诊断"可切到的 SAM 仅数万企业 × 低客单价，对独立 SaaS 偏小、对服务商工具足够。
- **需求真实性**：诊断是 vitamin（全行业免费）；付费发生在诊断之后的服务环节（代运营 3k–15k/月、建站 2–10 万/单）。
- **定位**：放弃"终端付费 SaaS"叙事，转向"服务商获客 + 交付提效工具（B2B2B）"，首个场景打"广告落地页承接体检"。
- **最大风险**：免费替代/LLM 稀释 > 报告通用 > 获客成本 > 服务承接缺失 > 模型成本。
- **90 天**：服务商付费试点、单行业做深+盲测、landing page 付费实验。

---

## 附录：主要来源

- 市场规模：[网经社 2025 跨境电商报告](https://tidenews.com.cn/tmh_news.html?id=6a0ef62a3854770001780045)、[商指针出口电商数据](https://www.100ec.cn/detail--6656579.html)、[跨境电商企业注册数据](https://yixiaoai.com/post/dynamics-of-chinas-cross-border-e-commerce-2025/)、[新卖家存活率](https://m.chwang.com/daily/20251211)、[民企出海报告](https://segg.sh.gov.cn/zxfw/xwzx/20250929/7efbc81c5ff946749cc156ab248d1745.html)、[独立站卖家数量](https://www.globelinkholding.com/article/2.html)
- 竞品与替代：[HubSpot Website Grader teardown](https://b2bgrowthhacking.com/teardowns/hubspot-website-grader)、[Semrush/Ahrefs 定价](https://growfore.com/semrush-vs-ahrefs/)、[SE Ranking 对比](https://seranking.com/blog/ahrefs-vs-semrush/)、[若聚凡星免费诊断钩子](https://ruojufanxing.com/solutions/b2b-seo/)、[询盘云免费工具推荐](https://www.leadscloud.com/waimaodulizhanyunan/)、[SavageAudit](https://savageaudit.com/blog/best-ai-website-audit-tools)、[LeakAudit](https://leakaudit.app/compare/leakaudit-vs-hubspot-website-grader)
- 付费能力：[店小秘定价](https://www.dianxiaomi.com/blog/article/455)、[店小秘/沙利文渗透率](https://www.dianxiaomi.com/blog/article/448)、[孚盟定价](https://m.amz123.com/ask/9hCRqrqr)、[领星定价](https://www.lingxing.com/help/article/amazonerphowmuch)、[易营宝定价](https://www.eyingbao.net/NEWS/ZIYUANZHONGXIN/AI_JIANZHANXUEYUAN/ZHINENGJIANZHANSHIHEWAIMAOQIYEMA_KANZHE12JIAB2BCHUKOUSHANGRUHEYONGTATISHENGXUNPANZHUANHUALYU.html)、[外贸建站费用](https://waimao.163.com/knowledge/article/1341)、[代运营收费](https://www.cnblogs.com/htyjz/p/19998317)、[B2B 海外营销服务费](https://m.10100.com/encyclopedia/explain/149238156)
- 未能验证项：B2B 外贸企业官网的准确数量；面向终端外贸企业的付费诊断 SaaS 存活案例（未检索到，作为负向证据引用）。
