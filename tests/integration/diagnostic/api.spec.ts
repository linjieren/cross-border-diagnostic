import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as request from "supertest";
import express from "express";

// Import the backend app directly for integration testing
// Note: This requires the backend to be buildable as a module
// If this fails, we fall back to HTTP-based integration tests against a running server

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const TEST_URL = "https://example.com";

/**
 * Integration tests for Diagnostic API endpoints.
 * These tests verify the backend API contract independently of the frontend.
 */

describe("Diagnostic API Integration", () => {
  let sessionId: string;

  it("POST /api/diagnostic/session - creates a new session", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/session")
      .send({ url: TEST_URL, targetMarket: "us" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.url).toBe(TEST_URL);
    expect(res.body.targetMarket).toBe("us");
    expect(res.body.status).toBe("in_progress");

    sessionId = res.body.id;
  });

  it("GET /api/diagnostic/session/:id - returns session with pages and results", async () => {
    const res = await request(BASE_URL).get(`/api/diagnostic/session/${sessionId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
    expect(Array.isArray(res.body.pages)).toBe(true);
  });

  it("POST /api/diagnostic/analyze - creates page and initializes 4 module results", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/analyze")
      .send({ url: TEST_URL, sessionId })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.url).toBe(TEST_URL);
    expect(res.body.results).toHaveLength(4);

    const modules = res.body.results.map((r: any) => r.module);
    expect(modules.sort()).toEqual([
      "form_tracking",
      "global_acceleration",
      "lead_page_check",
      "product_content_audit",
    ]);

    // All results should start as pending
    const statuses = res.body.results.map((r: any) => r.status);
    expect(statuses.every((s: string) => s === "pending")).toBe(true);
  });

  it("GET /api/diagnostic/page/:id - returns page with results", async () => {
    // First analyze to create a page
    const analyzeRes = await request(BASE_URL)
      .post("/api/diagnostic/analyze")
      .send({ url: TEST_URL, sessionId })
      .set("Content-Type", "application/json");

    const pageId = analyzeRes.body.id;

    const res = await request(BASE_URL).get(`/api/diagnostic/page/${pageId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(pageId);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBe(4);
  });

  it("POST /api/diagnostic/screenshot - returns screenshot metadata", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/screenshot")
      .send({ url: TEST_URL, sessionId })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.url).toBe(TEST_URL);
    expect(res.body.title).toBeDefined();
    expect(res.body.screenshotUrl).toMatch(/\/screenshots\/.+\.png/);
  });

  it("POST /api/diagnostic/report - generates HTML report", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/report")
      .send({ sessionId, format: "html" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.format).toBe("html");
    expect(res.body.downloadUrl).toMatch(/\/reports\/report-.+\.html/);
  });

  it("POST /api/diagnostic/report - generates Markdown report", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/report")
      .send({ sessionId, format: "markdown" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.format).toBe("markdown");
    expect(res.body.downloadUrl).toMatch(/\/reports\/report-.+\.md/);
  });

  it("POST /api/diagnostic/report - generates PDF report", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/report")
      .send({ sessionId, format: "pdf" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.format).toBe("pdf");
    expect(res.body.downloadUrl).toMatch(/\/reports\/report-.+\.pdf/);
  });

  it("GET /api/diagnostic/proxy - returns rewritten HTML", async () => {
    const res = await request(BASE_URL).get(
      `/api/diagnostic/proxy?url=${encodeURIComponent(TEST_URL)}`
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<html");
    // Should contain injected tracker script
    expect(res.text).toContain("diagnostic-navigate");
  });

  it("GET /api/diagnostic/proxy - rejects local addresses", async () => {
    const res = await request(BASE_URL).get(
      "/api/diagnostic/proxy?url=http://localhost:3000/admin"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("local");
  });

  it("GET /api/diagnostic/session/:id - returns 404 for missing session", async () => {
    const res = await request(BASE_URL).get("/api/diagnostic/session/non-existent-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("session not found");
  });

  it("POST /api/diagnostic/session - rejects missing fields", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/session")
      .send({ url: TEST_URL })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/diagnostic/analyze - rejects missing sessionId", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/analyze")
      .send({ url: TEST_URL })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/diagnostic/report - rejects missing sessionId", async () => {
    const res = await request(BASE_URL)
      .post("/api/diagnostic/report")
      .send({ format: "html" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
