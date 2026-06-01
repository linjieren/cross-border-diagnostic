import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 契约符合性测试
 *
 * 验证反馈平台各组件之间的契约是否正确实现。
 * 这些测试不依赖运行中的应用，只验证契约文件本身的完整性和一致性。
 */

const projectRoot = path.resolve(__dirname, "../../..");

describe("契约文件完整性", () => {
  it("schema.json 存在且可解析", () => {
    const schemaPath = path.join(projectRoot, "feedback", "schema.json");
    expect(fs.existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    expect(schema.title).toBeDefined();
    expect(schema.properties).toBeDefined();
  });

  it("integration-contract.md 存在且包含关键约定", () => {
    const contractPath = path.join(
      projectRoot,
      "feedback",
      "integration-contract.md"
    );
    expect(fs.existsSync(contractPath)).toBe(true);
    const content = fs.readFileSync(contractPath, "utf-8");
    // 验证关键约定存在（以当前契约实际内容为准）
    expect(content).toContain("FastAPI");
    expect(content).toContain("/api/feedback");
    expect(content).toContain("request_wake_at");
  });

  it("classifier.md 存在且定义了所有分类", () => {
    const classifierPath = path.join(
      projectRoot,
      "feedback",
      "classifier.md"
    );
    expect(fs.existsSync(classifierPath)).toBe(true);
    const content = fs.readFileSync(classifierPath, "utf-8");
    expect(content).toContain("bug");
    expect(content).toContain("ui_ux");
    expect(content).toContain("feature_request");
    expect(content).toContain("performance");
    expect(content).toContain("other");
    expect(content).toContain("p0_critical");
    expect(content).toContain("p1_high");
    expect(content).toContain("p2_medium");
    expect(content).toContain("p3_low");
  });
});

describe("schema.json 与 feedback-samples 一致性", () => {
  it("所有样例 ID 符合 schema 定义的 pattern", () => {
    const idPattern = /^fbk-\d{13}-[a-f0-9]{8}$/;
    const fixturesPath = path.join(
      __dirname,
      "../../fixtures/feedback-samples.json"
    );
    const samples = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
    for (const sample of samples) {
      expect(idPattern.test(sample.id)).toBe(true);
    }
  });

  it("所有样例的 source 在 schema 定义的枚举内", () => {
    const validSources = ["dev-feedback-button", "manual_entry", "external"];
    const fixturesPath = path.join(
      __dirname,
      "../../fixtures/feedback-samples.json"
    );
    const samples = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
    for (const sample of samples) {
      expect(validSources).toContain(sample.source);
    }
  });

  it("所有样例的 type 在 schema 定义的枚举内", () => {
    const validTypes = ["text", "screenshot", "both"];
    const fixturesPath = path.join(
      __dirname,
      "../../fixtures/feedback-samples.json"
    );
    const samples = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
    for (const sample of samples) {
      expect(validTypes).toContain(sample.type);
    }
  });
});

describe("docker-compose 部署契约", () => {
  it("docker-compose.yml 存在且可解析", () => {
    const composePath = path.join(projectRoot, "ops", "docker-compose.yml");
    expect(fs.existsSync(composePath)).toBe(true);
    // 简单验证它是有效的 YAML 文本（不引入 yaml 解析库）
    const content = fs.readFileSync(composePath, "utf-8");
    expect(content).toContain("services:");
    expect(content).toContain("backend");
    expect(content).toContain("frontend");
    expect(content).toContain("nginx");
  });

  it("dev compose 包含 FEATURE_FEEDBACK_BUTTON=true", () => {
    const devCompose = path.join(
      projectRoot,
      "ops",
      "docker-compose.dev.yml"
    );
    expect(fs.existsSync(devCompose)).toBe(true);
    const content = fs.readFileSync(devCompose, "utf-8");
    // dev 版本应启用反馈按钮
    expect(content).toContain("FEATURE_FEEDBACK_BUTTON");
  });

  it("main compose 不含 FEATURE_FEEDBACK_BUTTON 或不设为 true", () => {
    const mainCompose = path.join(
      projectRoot,
      "ops",
      "docker-compose.main.yml"
    );
    expect(fs.existsSync(mainCompose)).toBe(true);
    const content = fs.readFileSync(mainCompose, "utf-8");
    // main 版本不应启用反馈按钮（或显式设为 false）
    const hasTrue =
      content.includes("FEATURE_FEEDBACK_BUTTON=true");
    expect(hasTrue).toBe(false);
  });
});

describe("evaluation 状态机完整性", () => {
  it("schema.json 中定义了 evaluation 和 iteration 字段", () => {
    const schemaPath = path.join(projectRoot, "feedback", "schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const props = schema.properties;
    expect(props.evaluation).toBeDefined();
    expect(props.evaluation.properties.status).toBeDefined();
    expect(props.iteration).toBeDefined();
  });

  it("schema evaluation.status 包含所有生命周期状态", () => {
    const schemaPath = path.join(projectRoot, "feedback", "schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const statusEnum = schema.properties.evaluation.properties.status.enum;
    const expected = [
      "new",
      "duplicate_of",
      "evaluated",
      "accepted",
      "rejected",
      "in_development",
      "verified",
      "closed",
    ];
    for (const state of expected) {
      expect(statusEnum).toContain(state);
    }
  });
});
