import { describe, it, expect } from "vitest";
import {
  fingerprint,
  isDuplicate,
  similarityScore,
} from "../../backend/src/lib/dedup";

describe("去重逻辑 (dedup.ts)", () => {
  describe("fingerprint", () => {
    it("相同内容产生相同指纹", () => {
      const f1 = fingerprint("点了保存按钮没反应，页面一直转圈");
      const f2 = fingerprint("点了保存按钮没反应，页面一直转圈");
      expect(f1).toBe(f2);
    });

    it("去标点不影响指纹", () => {
      const f1 = fingerprint("页面白屏了！！！");
      const f2 = fingerprint("页面白屏了");
      expect(f1).toBe(f2);
    });

    it("大小写不影响指纹", () => {
      const f1 = fingerprint("页面 BUG 了");
      const f2 = fingerprint("页面 bug 了");
      expect(f1).toBe(f2);
    });

    it("多余空格不影响指纹", () => {
      const f1 = fingerprint("页面  白屏   了");
      const f2 = fingerprint("页面白屏了");
      expect(f1).toBe(f2);
    });

    it("非中文非字母字符被移除", () => {
      const f1 = fingerprint("保存@#$%按钮");
      const f2 = fingerprint("保存按钮");
      expect(f1).toBe(f2);
    });
  });

  describe("similarityScore", () => {
    it("完全相同返回 1", () => {
      expect(similarityScore("abcdefgh", "abcdefgh")).toBe(1);
    });

    it("完全不同返回 0", () => {
      expect(similarityScore("abcdefgh", "12345678")).toBe(0);
    });

    it("部分匹配返回正确比例", () => {
      // "abcd" vs "abxx" = 2/4 = 0.5
      expect(similarityScore("abcd", "abxx")).toBe(0.5);
    });
  });

  describe("isDuplicate", () => {
    it("相似度 >= 80% 判定为重复", () => {
      const f1 = fingerprint("点了保存按钮没反应，页面一直转圈");
      const f2 = fingerprint("点了保存按钮没有反应，页面一直转圈圈");
      expect(isDuplicate(f1, f2)).toBe(true);
    });

    it("完全不同内容不判定为重复", () => {
      const f1 = fingerprint("页面白屏了");
      const f2 = fingerprint("希望能批量删除");
      expect(isDuplicate(f1, f2)).toBe(false);
    });

    it("极短文本不误判", () => {
      expect(isDuplicate("a", "b")).toBe(false);
      expect(isDuplicate("abc", "abd")).toBe(false);
    });

    it("边界：80% 阈值", () => {
      // "abcd" vs "abce" = 3/4 = 75% < 80%
      expect(isDuplicate("abcd", "abce")).toBe(false);
      // "abcde" vs "abcdx" = 4/5 = 80% >= 80%
      expect(isDuplicate("abcde", "abcdx")).toBe(true);
    });
  });
});
