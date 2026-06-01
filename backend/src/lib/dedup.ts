/**
 * 去重逻辑 —— 复用 classifier.md 规则
 * 1. 文本标准化指纹（去标点、小写、去多余空格）
 * 2. 相似度 >= 80% 判定为重复
 */

export function fingerprint(text: string): string {
  const normalized = text
    .replace(/[，。！？、；：""''']/g, "")
    .replace(/[^\w一-鿿]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
  return normalized.slice(0, 8);
}

export function isDuplicate(fingerprintA: string, fingerprintB: string): boolean {
  if (fingerprintA.length < 4 || fingerprintB.length < 4) return false;
  let matches = 0;
  const minLen = Math.min(fingerprintA.length, fingerprintB.length);
  for (let i = 0; i < minLen; i++) {
    if (fingerprintA[i] === fingerprintB[i]) matches++;
  }
  return matches / minLen >= 0.8;
}

export function similarityScore(fingerprintA: string, fingerprintB: string): number {
  if (fingerprintA.length < 4 || fingerprintB.length < 4) return 0;
  let matches = 0;
  const minLen = Math.min(fingerprintA.length, fingerprintB.length);
  for (let i = 0; i < minLen; i++) {
    if (fingerprintA[i] === fingerprintB[i]) matches++;
  }
  return matches / minLen;
}
