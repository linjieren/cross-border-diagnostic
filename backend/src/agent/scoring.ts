// 共享计分模块：agent 管线的模块得分统一从这里取。
// 各档分值是产品侧约定值（不是统计推导结果）：
//   pass=100 / warn=65 / fail=35 / unknown=55
//   工具执行出错（带 error 字段）= 45，模块无任何 findings = 60（信息不足的中性分）。
// 注意：routes/diagnostic.ts 的 history 回退分支使用另一套口径（100/60/20），
// 本次只做抽取归拢，不改动算法，统一留待后续批次处理。

export interface ScoreableFinding {
  status?: string;
}

export interface ScoreableToolResult {
  findings?: ScoreableFinding[];
  error?: string;
}

export function moduleScore(result: ScoreableToolResult | null | undefined): number {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  if (result?.error) return 45;
  if (!findings.length) return 60;

  const total = findings.reduce((sum: number, finding: ScoreableFinding) => {
    if (finding?.status === "pass") return sum + 100;
    if (finding?.status === "warn") return sum + 65;
    if (finding?.status === "fail") return sum + 35;
    return sum + 55;
  }, 0);
  return Math.round(total / findings.length);
}
