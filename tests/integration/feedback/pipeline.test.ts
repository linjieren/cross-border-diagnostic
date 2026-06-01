import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * 反馈管道集成测试
 *
 * 模拟完整的反馈管道：raw → 分类 → 去重 → 优先级 → evaluated
 *
 * 这些测试验证：
 * 1. 反馈 JSON 文件的写入和读取
 * 2. 按日期分目录存储
 * 3. 生命周期状态转换 (new → evaluated → accepted/closed)
 * 4. 去重检查
 */

interface FeedbackEntry {
  id: string;
  source: string;
  type: string;
  content: {
    text: string;
    screenshots?: string[];
    fingerprint: string;
  };
  meta: {
    timestamp: string;
    version: string;
    page: string;
    user_agent: string;
  };
  evaluation?: {
    status: string;
    category?: string;
    priority?: string;
    duplicate_of?: string;
    notes?: string;
    evaluated_at?: string;
  };
}

function readFeedbackFile(filePath: string): FeedbackEntry {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeFeedbackFile(filePath: string, entry: FeedbackEntry): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
}

describe("反馈管道集成测试 (integration-contract.md)", () => {
  let rawDir: string;
  let evaluatedDir: string;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(tmpdir(), "fbk-test-"));
    rawDir = path.join(base, "raw", "2026-05-30");
    evaluatedDir = path.join(base, "evaluated");
    fs.mkdirSync(rawDir, { recursive: true });
    fs.mkdirSync(evaluatedDir, { recursive: true });
  });

  afterEach(() => {
    // 清理临时目录
    const base = path.dirname(path.dirname(rawDir));
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("反馈 JSON 可以写入 raw/ 目录并按日期分目录", () => {
    const entry: FeedbackEntry = {
      id: "fbk-1717000000001-a1b2c3d4",
      source: "dev-feedback-button",
      type: "text",
      content: {
        text: "测试反馈",
        fingerprint: "a1b2c3d4",
      },
      meta: {
        timestamp: "2026-05-30T10:00:00Z",
        version: "dev-0.1.0",
        page: "/test",
        user_agent: "test-agent",
      },
    };

    const filePath = path.join(rawDir, "fbk-1717000000001-a1b2c3d4.json");
    writeFeedbackFile(filePath, entry);

    expect(fs.existsSync(filePath)).toBe(true);
    const read = readFeedbackFile(filePath);
    expect(read.id).toBe("fbk-1717000000001-a1b2c3d4");
    expect(read.content.text).toBe("测试反馈");
  });

  it("反馈管道：new → evaluated 状态转换", () => {
    const entry: FeedbackEntry = {
      id: "fbk-1717000000002-e5f6g7h8",
      source: "dev-feedback-button",
      type: "text",
      content: {
        text: "页面白屏了",
        fingerprint: "e5f6g7h8",
      },
      meta: {
        timestamp: "2026-05-30T10:05:00Z",
        version: "dev-0.1.0",
        page: "/dashboard",
        user_agent: "test-agent",
      },
    };

    // Step 1: 写入 raw（status=new，由 evaluation.status 表达）
    const rawPath = path.join(rawDir, `${entry.id}.json`);
    writeFeedbackFile(rawPath, entry);

    // Step 2: 读取并评估
    const raw = readFeedbackFile(rawPath);
    raw.evaluation = {
      status: "evaluated",
      category: "bug",
      priority: "p0_critical",
      notes: "核心页面白屏，严重影响使用",
      evaluated_at: new Date().toISOString(),
    };

    // Step 3: 写入 evaluated/
    const evalPath = path.join(evaluatedDir, `${entry.id}.json`);
    writeFeedbackFile(evalPath, raw);

    // Step 4: 验证
    const evaluated = readFeedbackFile(evalPath);
    expect(evaluated.evaluation?.status).toBe("evaluated");
    expect(evaluated.evaluation?.category).toBe("bug");
    expect(evaluated.evaluation?.priority).toBe("p0_critical");
  });

  it("完整生命周期状态机：new → evaluated → accepted → in_development → verified → closed", () => {
    const states = [
      "evaluated",
      "accepted",
      "in_development",
      "verified",
      "closed",
    ];

    const entry: FeedbackEntry = {
      id: "fbk-lifecycle-test",
      source: "dev-feedback-button",
      type: "text",
      content: { text: "生命周期测试", fingerprint: "lctest01" },
      meta: {
        timestamp: new Date().toISOString(),
        version: "dev-0.1.0",
        page: "/test",
        user_agent: "test",
      },
    };

    const filePath = path.join(evaluatedDir, `${entry.id}.json`);

    for (const state of states) {
      entry.evaluation = {
        status: state,
        evaluated_at: new Date().toISOString(),
      };
      writeFeedbackFile(filePath, entry);
      const read = readFeedbackFile(filePath);
      expect(read.evaluation?.status).toBe(state);
    }
  });

  it("去重检查：相似反馈应标记 duplicate_of", () => {
    // 原始反馈
    const original: FeedbackEntry = {
      id: "fbk-original",
      source: "dev-feedback-button",
      type: "text",
      content: { text: "保存按钮没反应", fingerprint: "a1b2c3d4" },
      meta: {
        timestamp: new Date().toISOString(),
        version: "dev-0.1.0",
        page: "/editor",
        user_agent: "test",
      },
    };

    // 写入原始反馈
    writeFeedbackFile(
      path.join(evaluatedDir, `${original.id}.json`),
      original
    );

    // 重复反馈
    const duplicate: FeedbackEntry = {
      id: "fbk-duplicate",
      source: "dev-feedback-button",
      type: "text",
      content: { text: "保存按钮没反应", fingerprint: "a1b2c3d4" }, // 相同指纹
      meta: {
        timestamp: new Date().toISOString(),
        version: "dev-0.1.0",
        page: "/editor",
        user_agent: "test",
      },
    };

    // 去重检查逻辑
    const existingEntries = fs
      .readdirSync(evaluatedDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFeedbackFile(path.join(evaluatedDir, f)));

    const match = existingEntries.find(
      (e) => e.content.fingerprint === duplicate.content.fingerprint
    );

    expect(match).toBeDefined();

    // 标记重复
    duplicate.evaluation = {
      status: "duplicate_of",
      duplicate_of: match!.id,
      evaluated_at: new Date().toISOString(),
    };

    expect(duplicate.evaluation.status).toBe("duplicate_of");
    expect(duplicate.evaluation.duplicate_of).toBe("fbk-original");
  });
});
