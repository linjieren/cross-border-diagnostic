import { describe, it, expect } from "vitest";

/**
 * 根据 classifier.md 定义的规则实现的分类和优先级判断逻辑。
 *
 * 这就是测试驱动开发的起点：业务代码还没写，但规则已知，先用测试把规则锁死。
 * 当后端/管道代码实现时，这些测试直接搬过去验证。
 */

// ---- 分类规则（来自 classifier.md） ----

type Category = "bug" | "ui_ux" | "feature_request" | "performance" | "other";
type Priority = "p0_critical" | "p1_high" | "p2_medium" | "p3_low";

interface FeedbackContent {
  text: string;
  page?: string;
}

function classify(content: FeedbackContent): Category {
  const text = content.text;
  const combined = `${text} ${content.page ?? ""}`;

  // 崩溃、白屏、报错类信号 → bug
  if (
    text.includes("白屏") ||
    text.includes("崩溃") ||
    text.includes("报错") ||
    text.includes("没反应") ||
    text.includes("不响应") ||
    text.includes("失败") ||
    text.includes("异常") ||
    text.includes("错误") ||
    text.includes("闪退") ||
    /点了.*没/.test(text)
  ) {
    return "bug";
  }

  // 显示、颜色、交互、文案 → ui_ux
  if (
    text.includes("颜色") ||
    text.includes("看不清") ||
    text.includes("显示") ||
    text.includes("交互") ||
    text.includes("文案") ||
    text.includes("操作步骤") ||
    text.includes("布局") ||
    text.includes("位置") ||
    text.includes("排列")
  ) {
    return "ui_ux";
  }

  // 建议/希望新增 → feature_request
  if (
    text.includes("希望能") ||
    text.includes("建议") ||
    text.includes("加个") ||
    text.includes("加一个") ||
    text.includes("增加") ||
    text.includes("添加") ||
    text.includes("导出") ||
    text.includes("批量")
  ) {
    return "feature_request";
  }

  // 卡顿、慢、延迟、等待 → performance
  if (
    text.includes("慢") ||
    text.includes("卡") ||
    text.includes("卡顿") ||
    text.includes("延迟") ||
    text.includes("加载") ||
    text.includes("响应") ||
    text.includes("等")
  ) {
    return "performance";
  }

  return "other";
}

function prioritize(category: Category, text: string): Priority {
  // p0: 核心功能不可用、数据丢失、安全漏洞
  if (
    category === "bug" &&
    (text.includes("白屏") ||
      text.includes("崩溃") ||
      text.includes("数据丢失") ||
      text.includes("安全") ||
      text.includes("完全无法"))
  ) {
    return "p0_critical";
  }

  // p1: 严重影响体验，大部分用户会遇到
  if (
    category === "bug" ||
    (category === "performance" && text.includes("太慢"))
  ) {
    return "p1_high";
  }

  // p2: 部分用户体验下降
  if (category === "ui_ux" || category === "feature_request") {
    return "p2_medium";
  }

  return "p3_low";
}

/**
 * 内容指纹计算：去标点、小写、去多余空格后取 md5。
 * 这里用简化版（不使用真实 md5 避免依赖），真实实现用 crypto.createHash("md5")。
 */
function fingerprint(text: string): string {
  const normalized = text
    .replace(/[，。！？、；：""'']/g, "")
    .replace(/[^\w一-鿿]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
  // 简化：取归一化后文本的前 8 个字符作为指纹（真实环境用 md5 前 8 位）
  return normalized.slice(0, 8);
}

function isDuplicate(
  fingerprintA: string,
  fingerprintB: string
): boolean {
  if (fingerprintA.length < 4 || fingerprintB.length < 4) return false;
  let matches = 0;
  const minLen = Math.min(fingerprintA.length, fingerprintB.length);
  for (let i = 0; i < minLen; i++) {
    if (fingerprintA[i] === fingerprintB[i]) matches++;
  }
  return matches / minLen >= 0.8;
}

// ---- 测试用例 ----

describe("分类规则 (classifier.md)", () => {
  it('"点了保存没反应" 应归类为 bug', () => {
    expect(classify({ text: "点了保存没反应" })).toBe("bug");
  });

  it('"页面白屏" 应归类为 bug', () => {
    expect(classify({ text: "页面白屏了" })).toBe("bug");
  });

  it('"按钮颜色看不清" 应归类为 ui_ux', () => {
    expect(classify({ text: "按钮颜色看不清" })).toBe("ui_ux");
  });

  it('"希望能批量删除" 应归类为 feature_request', () => {
    expect(classify({ text: "希望能批量删除" })).toBe("feature_request");
  });

  it('"打开要等 5 秒" 应归类为 performance', () => {
    expect(classify({ text: "打开要等 5 秒" })).toBe("performance");
  });

  it("无关的闲聊应归类为 other", () => {
    expect(classify({ text: "这个产品挺好的" })).toBe("other");
  });
});

describe("优先级规则 (classifier.md)", () => {
  it("白屏 bug → p0_critical", () => {
    expect(prioritize("bug", "页面白屏了")).toBe("p0_critical");
  });

  it("点击无反应 bug → p1_high", () => {
    expect(prioritize("bug", "点了保存没反应")).toBe("p1_high");
  });

  it("性能太慢 → p1_high", () => {
    expect(prioritize("performance", "打开太慢了")).toBe("p1_high");
  });

  it("UI/UX 问题 → p2_medium", () => {
    expect(prioritize("ui_ux", "颜色看不清")).toBe("p2_medium");
  });

  it("功能请求 → p2_medium", () => {
    expect(prioritize("feature_request", "希望能加导出")).toBe("p2_medium");
  });

  it("other → p3_low", () => {
    expect(prioritize("other", "产品不错")).toBe("p3_low");
  });
});

describe("去重规则 (classifier.md)", () => {
  it("相同内容产生相同指纹", () => {
    const f1 = fingerprint("点了保存按钮没反应，页面一直转圈");
    const f2 = fingerprint("点了保存按钮没反应，页面一直转圈");
    expect(f1).toBe(f2);
  });

  it("相似内容判定为重复 (80% 阈值)", () => {
    const f1 = fingerprint("点了保存按钮没反应，页面一直转圈");
    const f2 = fingerprint("点了保存按钮没有反应，页面一直转圈圈");
    // f1 = "点了保存按钮没反应页面一直转圈" → first 8 chars
    // f2 = "点了保存按钮没有反应页面一直转圈圈" → first 8 chars
    // They share many characters at the start
    expect(isDuplicate(f1, f2)).toBe(true);
  });

  it("完全不同内容不判定为重复", () => {
    const f1 = fingerprint("页面白屏了");
    const f2 = fingerprint("希望能批量删除");
    expect(isDuplicate(f1, f2)).toBe(false);
  });

  it("标点符号不影响指纹", () => {
    const f1 = fingerprint("页面白屏了！！！");
    const f2 = fingerprint("页面白屏了");
    expect(f1).toBe(f2);
  });

  it("大小写不影响指纹", () => {
    const f1 = fingerprint("页面 BUG 了");
    const f2 = fingerprint("页面 bug 了");
    expect(f1).toBe(f2);
  });
});

describe("边界情况", () => {
  it("空文本应归为 other", () => {
    expect(classify({ text: "" })).toBe("other");
  });

  it("极短文本去重不误判", () => {
    expect(isDuplicate("a", "b")).toBe(false);
  });
});
