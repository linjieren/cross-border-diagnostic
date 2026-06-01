# FEAT-303 多语言国际化（i18n）技术方案

## 1. 选型结论

### 前端：react-i18next + i18next

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **react-i18next** | React 生态最主流；hooks API 成熟；Vite 插件生态完善；支持 SSR/代码分割；TypeScript 类型支持好 | 包体积略大（~20KB gzip） | **推荐** |
| Lingui | 编译时提取，运行时轻量；支持 ICU MessageFormat | 生态较小；Vite 集成文档少；团队学习成本略高 | 备选 |
| react-intl (FormatJS) | ICU 标准；功能完整 | 包体积大；配置复杂；与现有栈契合度一般 | 不推荐 |

**选择 react-i18next 理由**：
- 团队已有 React + Vite + TypeScript 经验，react-i18next 的 `useTranslation` hook 与现有组件模式无缝兼容
- `i18next-http-backend` 支持按 namespace 按需加载语言文件，不影响首屏 bundle
- `i18next-browser-languagedetector` 自动检测用户语言偏好
- 社区活跃，问题搜索和解决方案最丰富

### 后端：i18next (Node.js) + 简单 JSON 映射

后端 i18n 需求相对简单：
- 报告生成（HTML/PDF/Markdown）中的静态文案
- 邮件/通知模板中的固定文本
- API 错误消息的多语言返回

**方案**：前后端共用同一套 JSON 语言文件，后端使用 `i18next` Node.js 版本加载相同资源。

## 2. 前端集成步骤

### 2.1 安装依赖

```bash
npm install react-i18next i18next i18next-http-backend i18next-browser-languagedetector
npm install -D @types/i18next  # 如需要
```

### 2.2 初始化配置

新建 `src/i18n/index.ts`：

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en', 'ja', 'ko'],
    ns: ['common', 'diagnostic', 'report', 'auth'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React 已做 XSS 防护
    },
  })

export default i18n
```

在 `src/main.tsx`（或入口文件）顶部引入：

```ts
import './i18n'
```

### 2.3 组件中使用

```tsx
import { useTranslation } from 'react-i18next'

function DiagnosticPanel() {
  const { t } = useTranslation('diagnostic')
  return <h1>{t('title')}</h1>
}
```

带插值：

```tsx
const { t } = useTranslation('diagnostic')
t('scoreLabel', { score: 85 })
// JSON: "scoreLabel": "综合评分: {{score}}/100"
```

### 2.4 语言切换 UI

在顶部导航栏添加切换器：

```tsx
import { useTranslation } from 'react-i18next'

const LANG_LABELS: Record<string, string> = {
  'zh-CN': '中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
}

function LangSwitcher() {
  const { i18n } = useTranslation()
  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="text-sm bg-transparent border border-gray-300 rounded px-2 py-1"
    >
      {i18n.options.supportedLngs?.filter((l) => l !== 'cimode').map((lng) => (
        <option key={lng} value={lng}>{LANG_LABELS[lng] || lng}</option>
      ))}
    </select>
  )
}
```

## 3. 后端集成步骤

### 3.1 安装依赖

```bash
npm install i18next i18next-fs-backend
```

### 3.2 初始化配置

新建 `src/lib/i18n.ts`：

```ts
import i18next from 'i18next'
import FsBackend from 'i18next-fs-backend'
import path from 'path'

await i18next
  .use(FsBackend)
  .init({
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en', 'ja', 'ko'],
    ns: ['common', 'diagnostic', 'report', 'email'],
    defaultNS: 'common',
    backend: {
      loadPath: path.join(process.cwd(), 'locales/{{lng}}/{{ns}}.json'),
    },
    interpolation: { escapeValue: false },
  })

export { i18next }
```

### 3.3 API 错误消息多语言

在 Express 中间件中根据请求语言返回错误：

```ts
function getErrorMessage(key: string, lang?: string): string {
  return i18next.getResource(lang || 'zh-CN', 'common', key) || key
}
```

### 3.4 报告生成多语言

报告 HTML/Markdown 中的静态文案改为通过 `i18next.t()` 获取，保持与前端同一套 key：

```ts
import { i18next } from '../lib/i18n'

function generateReportHtml(session: any, pages: any[], lang = 'zh-CN') {
  const t = (key: string, opts?: any) => i18next.t(key, { lng: lang, ...opts })
  // 使用 t('report.coverTitle') 替代硬编码
}
```

## 4. 语言文件目录结构

```
backend/locales/
├── zh-CN/
│   ├── common.json
│   ├── diagnostic.json
│   ├── report.json
│   ├── auth.json
│   └── email.json
├── en/
│   ├── common.json
│   ├── diagnostic.json
│   ├── report.json
│   ├── auth.json
│   └── email.json
├── ja/
│   └── ...
└── ko/
    └── ...

frontend/public/locales/
├── zh-CN/
│   ├── common.json
│   ├── diagnostic.json
│   ├── report.json
│   └── auth.json
├── en/
│   └── ...
├── ja/
│   └── ...
└── ko/
    └── ...
```

**说明**：
- 前后端共用相同 namespace 和 key，避免翻译不一致
- `common.json`：通用 UI 文案（按钮、导航、状态）
- `diagnostic.json`：诊断工作台相关（模块名、分析步骤、评分标签）
- `report.json`：报告相关（章节标题、 severity 等级、建议模板）
- `auth.json`：登录/注册相关
- `email.json`：后端专用（通知邮件模板）

## 5. 首版支持语言列表

| 语言 | 代码 | 优先级 | 说明 |
|---|---|---|---|
| 简体中文 | zh-CN | P0（默认） | 核心用户群，必须完整支持 |
| 英语 | en | P1 | 出海诊断面向的主要海外市场 |
| 日语 | ja | P2 | 日本市场（第三大出海目标） |
| 韩语 | ko | P2 | 韩国市场 |

**建议**：v1.4 首版实现框架 + 中文/英文完整翻译。日文/韩文可先放 key 和机翻占位，后续由运营团队精修。

## 6. 工作量估算

| 事项 | 预估工时 | 负责端 |
|---|---|---|
| 前端 i18n 框架集成 + 语言切换 UI | 2h | 前端 |
| 后端 i18n 框架集成 + API 错误消息改造 | 2h | 后端 |
| 提取所有硬编码文案到 JSON | 4h | 前端 + 后端 |
| 中文/英文翻译填充 | 3h | 前端 + 后端 |
| 日文/韩文机翻占位 + 后续精修流程 | 1h | 前端 |
| 端到端验证（语言切换、报告生成、错误消息） | 2h | 联调 |
| **总计** | **~14h** | — |

## 7. 风险与注意事项

1. **SEO/SSR**：当前前端是 SPA（Vite + React），语言切换不影响 SEO。若未来需要 SSR，i18next 的 `react-i18next` + `i18next-http-backend` 可平滑迁移到 Next.js 的 `next-i18next`
2. **日期/数字/货币格式**：使用 `Intl.DateTimeFormat` / `Intl.NumberFormat` 或 `react-intl` 的部分功能作为补充，不全部依赖 i18next
3. **报告 PDF 中的字体**：日文/韩文需要确保 PDF 生成时嵌入对应字体（Noto Sans CJK），当前方案已支持
4. **API 返回语言协商**：前端在请求头中携带 `Accept-Language`，后端优先使用该头，其次 fallback 到 zh-CN
