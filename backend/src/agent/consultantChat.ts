import { callDeepSeek, DeepSeekMessage } from "./deepseek";
import { prisma } from "../lib/prisma";

export type ChatIntent = "report_followup" | "general";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function recognizeIntent(userMessage: string): Promise<ChatIntent> {
  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: `Classify the user's message intent. The user is viewing a website diagnostic report. When they mention "tracking", they mean marketing analytics tracking (GA4, Meta Pixel, LinkedIn Insight Tag, TikTok Pixel), NOT logistics or shipping tracking. Respond with only one word: "report_followup" if the user is asking about the diagnostic report, its recommendations, or any of the four modules (global acceleration, lead page, product content, form tracking / analytics), or "general" otherwise.`,
    },
    { role: "user", content: userMessage },
  ];

  const res = await callDeepSeek({
    messages,
    temperature: 0.2,
    maxTokens: 16,
  });

  const intent = res.trim().toLowerCase();
  return intent.includes("report") ? "report_followup" : "general";
}

export async function chatWithConsultant(
  sessionId: string,
  userMessage: string,
  history: ChatMessage[],
  reportMarkdown?: string,
  language?: string
): Promise<{ reply: string; intent: ChatIntent; quotedText?: string }> {
  const intent = await recognizeIntent(userMessage);

  const contextWindow = history.slice(-10);
  const lang = language || "zh-CN";
  const isEnglish = lang.startsWith("en");

  const languageInstruction = isEnglish
    ? "Prefer to reply in English, but match the user's question language if they write in a different language."
    : "优先使用中文回复，但如果用户用其他语言提问，请灵活匹配用户的语言。";

  let systemPrompt = `You are a senior cross-border e-commerce consultant. You are chatting with a client who has run a website diagnostic. Be helpful, concise, and professional.\n\n${languageInstruction}`;

  if (reportMarkdown && intent === "report_followup") {
    systemPrompt += `\n\nHere is the diagnostic report they are referring to:\n\n${reportMarkdown.slice(0, 4000)}\n\nBase your answers on this report. Quote specific findings when relevant.`;
  }

  const messages: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt },
    ...contextWindow.map((h) => ({ role: h.role, content: h.content }) as DeepSeekMessage),
    { role: "user", content: userMessage },
  ];

  const reply = await callDeepSeek({
    messages,
    temperature: 0.5,
    maxTokens: 2048,
  });

  const quoteMatch = reply.match(/"([^"]{10,200})"/);
  const quotedText = quoteMatch ? quoteMatch[1] : undefined;

  return { reply, intent, quotedText };
}

export async function saveChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  message: string,
  intent?: string,
  quotedText?: string
) {
  await prisma.consultantChat.create({
    data: {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      role,
      message,
      intent,
      quotedText,
    },
  });
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const rows = await prisma.consultantChat.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.message }));
}
