import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../../backend/src/app";
import { prisma } from "../../../backend/src/lib/prisma";

/**
 * 去重 API 集成测试
 *
 * 测试：
 * 1. GET /api/feedback 列表查询 + dedupStatus 筛选
 * 2. POST /api/feedback/dedup 单条去重检测
 * 3. POST /api/feedback/dedup-all 批量去重（权限控制）
 */

async function createTestFeedback(text: string, id?: string) {
  const res = await request(app)
    .post("/api/feedback")
    .send({
      id,
      source: "test",
      type: "text",
      content: { text, fingerprint: "testfp" },
      meta: { timestamp: new Date().toISOString(), version: "test", page: "/test", user_agent: "test" },
    });
  return res.body.id as string;
}

describe("去重 API 集成测试", () => {
  beforeAll(async () => {
    // 清理测试数据
    await prisma.feedback.deleteMany({ where: { source: "test" } });
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { source: "test" } });
    await prisma.$disconnect();
  });

  describe("GET /api/feedback", () => {
    it("返回反馈列表", async () => {
      const id = await createTestFeedback("GET 列表测试反馈");
      const res = await request(app).get("/api/feedback").expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.some((i: any) => i.id === id)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("支持 dedupStatus=unique 筛选", async () => {
      await createTestFeedback("unique 筛选测试");
      const res = await request(app).get("/api/feedback?dedupStatus=unique").expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      for (const item of res.body.items) {
        expect(item.duplicateOf).toBeNull();
      }
    });

    it("支持 dedupStatus=duplicates 筛选", async () => {
      const res = await request(app).get("/api/feedback?dedupStatus=duplicates").expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      for (const item of res.body.items) {
        expect(item.duplicateOf).not.toBeNull();
      }
    });
  });

  describe("POST /api/feedback/dedup", () => {
    it("对重复反馈检测并标记", async () => {
      const id1 = await createTestFeedback("保存按钮没反应");
      const id2 = await createTestFeedback("保存按钮没反应");

      const res = await request(app)
        .post("/api/feedback/dedup")
        .send({ feedbackId: id2 })
        .expect(200);

      expect(res.body.duplicateOf).toBe(id1);
      expect(res.body.duplicateGroupId).toBeDefined();
      expect(res.body.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.body.reason).toContain("相似度");
    });

    it("对不重复反馈返回 null", async () => {
      const id = await createTestFeedback("完全不相关的反馈内容 xyz123");

      const res = await request(app)
        .post("/api/feedback/dedup")
        .send({ feedbackId: id })
        .expect(200);

      expect(res.body.duplicateOf).toBeNull();
      expect(res.body.confidence).toBe(0);
      expect(res.body.reason).toBe("未找到重复");
    });

    it("feedbackId 缺失返回 400", async () => {
      await request(app).post("/api/feedback/dedup").send({}).expect(400);
    });

    it("不存在的 feedbackId 返回 404", async () => {
      await request(app)
        .post("/api/feedback/dedup")
        .send({ feedbackId: "fbk-nonexistent-00000000" })
        .expect(404);
    });
  });

  describe("POST /api/feedback/dedup-all", () => {
    it("无 admin token 返回 403", async () => {
      await request(app).post("/api/feedback/dedup-all").expect(403);
    });

    it("有 admin token 执行批量去重", async () => {
      // 清理之前的测试数据
      await prisma.feedback.deleteMany({ where: { source: "test" } });

      const id1 = await createTestFeedback("页面加载非常缓慢需要优化");
      const id2 = await createTestFeedback("页面加载非常缓慢需要优化");
      const id3 = await createTestFeedback("登录按钮颜色看不清楚要改");

      const res = await request(app)
        .post("/api/feedback/dedup-all")
        .set("x-admin-token", "dev-admin-token")
        .expect(200);

      expect(typeof res.body.processedCount).toBe("number");
      expect(typeof res.body.groupCount).toBe("number");
      expect(res.body.processedCount).toBeGreaterThanOrEqual(2);

      // 验证数据库状态
      const dup = await prisma.feedback.findUnique({ where: { id: id2 } });
      expect(dup?.duplicateOf).toBe(id1);
      expect(dup?.duplicateGroupId).not.toBeNull();

      const unique = await prisma.feedback.findUnique({ where: { id: id3 } });
      expect(unique?.duplicateOf).toBeNull();
    });
  });
});
