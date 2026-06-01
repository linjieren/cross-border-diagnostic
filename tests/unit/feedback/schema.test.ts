import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../../..");

const schemaPath = path.join(projectRoot, "feedback", "schema.json");
const fixturesPath = path.join(
  projectRoot,
  "tests",
  "fixtures",
  "feedback-samples.json"
);

describe("Feedback Schema 验证", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  let schema: object;
  let samples: object[];

  beforeAll(() => {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    samples = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
  });

  it("schema.json 自身可被 JSON.parse 解析且包含关键字段", () => {
    expect(schema).toBeDefined();
    expect((schema as any).title).toBe("Feedback Entry");
    expect((schema as any).properties).toBeDefined();
    expect((schema as any).required).toContain("id");
    expect((schema as any).required).toContain("content");
  });

  it("所有样例数据通过 schema 验证", () => {
    // 去掉 $schema 引用避免 ajv 尝试加载远程 meta-schema
    const schemaCopy = JSON.parse(JSON.stringify(schema));
    delete (schemaCopy as any).$schema;
    const validate = ajv.compile(schemaCopy);
    for (const sample of samples) {
      const valid = validate(sample);
      if (!valid) {
        console.error(
          `数据 ${(sample as any).id} 验证失败:`,
          validate.errors
        );
      }
      expect(valid).toBe(true);
    }
  });

  it("schema 验证拒绝无效数据", () => {
    const schemaCopy = JSON.parse(JSON.stringify(schema));
    delete (schemaCopy as any).$schema;
    const validate = ajv.compile(schemaCopy);

    // 缺少 id
    const noId = { ...samples[0], id: undefined };
    delete (noId as any).id;
    expect(validate(noId)).toBe(false);

    // 缺少 content
    const noContent = { ...samples[0], content: undefined };
    delete (noContent as any).content;
    expect(validate(noContent)).toBe(false);

    // 非法 id 格式
    expect(validate({ ...samples[0], id: "invalid-id" })).toBe(false);

    // 非法 type
    expect(validate({ ...samples[0], type: "video" })).toBe(false);

    // content.text 缺失
    const noText = JSON.parse(JSON.stringify(samples[0]));
    noText.content.text = undefined;
    delete noText.content.text;
    expect(validate(noText)).toBe(false);

    // 非法 source
    expect(validate({ ...samples[0], source: "unknown_source" })).toBe(false);

    // evaluation 和 iteration 为选填，合法数据应通过
    expect(validate(samples[0])).toBe(true);
  });
});
