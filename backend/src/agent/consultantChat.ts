import { callDeepSeek, DeepSeekMessage } from "./deepseek";
import { prisma } from "../lib/prisma";
import { buildTrustedSourcesPrompt, sanitizeTrustedLinks } from "./trustedSources";

export type ChatIntent = "report_followup" | "general";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  quotedText?: string;
}

export async function recognizeIntent(userMessage: string, quotedText?: string): Promise<ChatIntent> {
  if (quotedText) return "report_followup";

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
  language?: string,
  quotedText?: string
): Promise<{ reply: string; intent: ChatIntent; quotedText?: string }> {
  const intent = await recognizeIntent(userMessage, quotedText);

  const contextWindow = history.slice(-10);
  const lang = language || "zh-CN";
  const isEnglish = lang.startsWith("en");

  const languageInstruction = isEnglish
    ? "Prefer to reply in English, but match the user's question language if they write in a different language."
    : "优先使用中文回复，但如果用户用其他语言提问，请灵活匹配用户的语言。";

  let systemPrompt = `You are a senior cross-border e-commerce consultant. You are chatting with a founder or website owner who has run a cross-border website diagnostic. The user needs practical technical guidance first, with product, marketing, and conversion context as supporting explanation.

${languageInstruction}

Answer style:
- Be concise and operational.
- If the user asks how to fix something, use this structure: 结论 / 具体怎么做 / 怎么验证.
- If the user asks why it matters, explain the business impact in plain language first, then mention the technical reason.
- If the user asks something outside the diagnostic report, answer as supplemental guidance and clearly say it is not a confirmed finding from this diagnostic.
- Do not ask the user to choose a role. Adapt depth automatically from the question.`;

  systemPrompt += `

Chat formatting rules:
- Reply like a modern AI assistant chat, not like a formal report.
- Use short paragraphs and flat Markdown bullet lists.
- Avoid deeply nested lists, outline indentation, tables, and decorative separators.
- When presenting priorities, comparisons, parameter sets, or summarized recommendations, prefer a Markdown table if it makes the answer easier to scan.
- When giving steps, prefer 3-6 flat bullets. Do not rely on indentation to show hierarchy.
- Write external references as Markdown links, for example [Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/get-started/).
- Keep code blocks only when code is necessary, and keep each code block as short as possible.
- Do not use emoji or sticker-like symbols.`;

  systemPrompt += buildTrustedSourcesPrompt();

  if (reportMarkdown && intent === "report_followup") {
    systemPrompt += `\n\nHere is the diagnostic report they are referring to:\n\n${reportMarkdown.slice(0, 4000)}\n\nBase your answers on this report. Quote specific findings when relevant.`;
  }

  if (quotedText) {
    systemPrompt += `\n\nThe user selected this exact report excerpt as context:\n"${quotedText}"\n\nUse it as the main context for the answer.`;
  }

  const messages: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt },
    ...contextWindow.map((h) => {
      const content = h.quotedText
        ? `${h.content}\n\n引用报告片段：${h.quotedText}`
        : h.content;
      return { role: h.role, content } as DeepSeekMessage;
    }),
    {
      role: "user",
      content: quotedText ? `${userMessage}\n\n引用报告片段：${quotedText}` : userMessage,
    },
  ];

  const reply = await callDeepSeek({
    messages,
    temperature: 0.5,
    maxTokens: 2048,
  });

  const sanitizedReply = await sanitizeTrustedLinks(reply);

  return { reply: sanitizedReply, intent, quotedText };
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
  return Promise.all(
    rows.map(async (r) => ({
      role: r.role as "user" | "assistant",
      content: r.role === "assistant" ? await sanitizeTrustedLinks(r.message) : r.message,
      quotedText: r.quotedText || undefined,
    }))
  );
}
