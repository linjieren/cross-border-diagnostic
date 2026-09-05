import { moduleScore } from "./scoring";

export interface ReportInsightIssue {
  module: string;
  check: string;
  status: "fail" | "warn";
  detail: string;
  evidence?: string;
}

export interface ReportInsightModule {
  module: string;
  score: number | null;
  passCount: number;
  warnCount: number;
  failCount: number;
}

export interface ReportInsights {
  overallScore: number | null;
  modules: ReportInsightModule[];
  issues: ReportInsightIssue[];
  topIssues: ReportInsightIssue[];
}

interface SessionLike {
  agentSteps: unknown;
  pages?: Array<{
    weight?: number | null;
    results?: Array<{ module: string; status: string; score: number | null }>;
  }>;
}

function extractToolResults(agentSteps: unknown): any[] {
  if (!Array.isArray(agentSteps)) return [];
  const toolStep = agentSteps.find(
    (step: any) => step?.name === "tool_execution" || step?.step === 2
  );
  const result = toolStep?.result;
  return Array.isArray(result) ? result : [];
}

function buildAgentInsights(toolResults: any[]): ReportInsights {
  const modules: ReportInsightModule[] = toolResults.map((tr: any) => {
    const findings = Array.isArray(tr?.findings) ? tr.findings : [];
    return {
      module: typeof tr?.module === "string" ? tr.module : "unknown",
      score: moduleScore(tr),
      passCount: findings.filter((f: any) => f?.status === "pass").length,
      warnCount: findings.filter((f: any) => f?.status === "warn").length,
      failCount: findings.filter((f: any) => f?.status === "fail").length,
    };
  });

  const issues: ReportInsightIssue[] = [];
  for (const tr of toolResults) {
    const moduleId = typeof tr?.module === "string" ? tr.module : "unknown";
    const findings = Array.isArray(tr?.findings) ? tr.findings : [];
    for (const finding of findings) {
      if (finding?.status !== "fail" && finding?.status !== "warn") continue;
      issues.push({
        module: moduleId,
        check: typeof finding?.check === "string" ? finding.check : "",
        status: finding.status,
        detail: typeof finding?.detail === "string" ? finding.detail : "",
        evidence:
          typeof finding?.evidence === "string" && finding.evidence
            ? finding.evidence
            : undefined,
      });
    }
  }
  // Stable sort: fail (critical) first, then warn.
  issues.sort((a, b) =>
    a.status === b.status ? 0 : a.status === "fail" ? -1 : 1
  );

  const scored = modules.filter((m) => m.score != null);
  const overallScore = scored.length
    ? Math.round(
        scored.reduce((sum, m) => sum + (m.score ?? 0), 0) / scored.length
      )
    : null;

  return { overallScore, modules, issues, topIssues: issues.slice(0, 3) };
}

function buildLegacyInsights(pages: NonNullable<SessionLike["pages"]>): ReportInsights {
  const moduleMap = new Map<string, { total: number; count: number }>();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const page of pages) {
    const results = Array.isArray(page.results) ? page.results : [];
    const scoredResults = results.filter((r) => r.score != null);
    if (!scoredResults.length) continue;

    const pageScore =
      scoredResults.reduce((a, r) => a + (r.score ?? 0), 0) / scoredResults.length;
    const weight = page.weight ?? 1;
    weightedSum += pageScore * weight;
    totalWeight += weight;

    for (const r of scoredResults) {
      const entry = moduleMap.get(r.module) || { total: 0, count: 0 };
      entry.total += r.score ?? 0;
      entry.count += 1;
      moduleMap.set(r.module, entry);
    }
  }

  const modules: ReportInsightModule[] = Array.from(moduleMap.entries()).map(
    ([moduleId, entry]) => ({
      module: moduleId,
      score: Math.round(entry.total / entry.count),
      passCount: 0,
      warnCount: 0,
      failCount: 0,
    })
  );

  return {
    overallScore: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null,
    modules,
    issues: [],
    topIssues: [],
  };
}

export function buildReportInsights(session: SessionLike): ReportInsights {
  const toolResults = extractToolResults(session.agentSteps);
  if (toolResults.length) {
    return buildAgentInsights(toolResults);
  }

  const pages = Array.isArray(session.pages) ? session.pages : [];
  return buildLegacyInsights(pages);
}
