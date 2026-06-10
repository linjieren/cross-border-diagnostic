import { prisma } from "../lib/prisma";
import { runAgentDiagnosis, AgentEvent } from "./orchestrator";

type SessionListener = (event: AgentEvent) => void;

const sessionListeners = new Map<string, Set<SessionListener>>();
const sessionEventHistory = new Map<string, AgentEvent[]>();
const runningSessions = new Map<string, Promise<void>>();

function rememberEvent(sessionId: string, event: AgentEvent) {
  const history = sessionEventHistory.get(sessionId) || [];
  history.push(event);
  if (history.length > 200) {
    history.splice(0, history.length - 200);
  }
  sessionEventHistory.set(sessionId, history);
}

export function publishSessionEvent(sessionId: string, event: AgentEvent) {
  rememberEvent(sessionId, event);
  const listeners = sessionListeners.get(sessionId);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeToSession(sessionId: string, listener: SessionListener) {
  const listeners = sessionListeners.get(sessionId) || new Set<SessionListener>();
  listeners.add(listener);
  sessionListeners.set(sessionId, listeners);

  return () => {
    const current = sessionListeners.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      sessionListeners.delete(sessionId);
    }
  };
}

export function getSessionEventHistory(sessionId: string): AgentEvent[] {
  return [...(sessionEventHistory.get(sessionId) || [])];
}

export function isSessionDiagnosisRunning(sessionId: string): boolean {
  return runningSessions.has(sessionId);
}

function clearSessionHistory(sessionId: string) {
  sessionEventHistory.delete(sessionId);
}

export async function startSessionDiagnosis(sessionId: string): Promise<void> {
  const existing = runningSessions.get(sessionId);
  if (existing) {
    return existing;
  }

  clearSessionHistory(sessionId);

  const promise = (async () => {
    const session = await prisma.diagnosticSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      publishSessionEvent(sessionId, {
        type: "error",
        payload: { message: "session not found" },
      });
      return;
    }

    if (session.status === "completed") {
      publishSessionEvent(sessionId, { type: "report-complete" });
      return;
    }

    await prisma.diagnosticSession.update({
      where: { id: sessionId },
      data: { status: "in_progress", agentSteps: [] as any },
    });

    await runAgentDiagnosis(session.id, session.url, session.targetMarket, (event) => {
      publishSessionEvent(session.id, event);
    });
  })()
    .catch((err) => {
      console.error(`session ${sessionId} diagnosis failed:`, err);
      publishSessionEvent(sessionId, {
        type: "error",
        payload: { message: err.message || "diagnosis failed" },
      });
    })
    .finally(() => {
      runningSessions.delete(sessionId);
    });

  runningSessions.set(sessionId, promise);
  return promise;
}
