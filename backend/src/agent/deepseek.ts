export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekOptions {
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: { type: "json_object" | "text" };
}

export class DeepSeekError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function callDeepSeek(
  options: DeepSeekOptions & { stream: true },
  onChunk: (chunk: string) => void
): Promise<string>;
export async function callDeepSeek(
  options: DeepSeekOptions & { stream?: false }
): Promise<string>;
export async function callDeepSeek(
  options: DeepSeekOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    throw new DeepSeekError("MISSING_API_KEY", "DEEPSEEK_API_KEY is not configured");
  }

  const body: any = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2048,
    stream: options.stream ?? false,
  };
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new DeepSeekError(`HTTP_${res.status}`, `DeepSeek API error: ${text}`);
    }

    if (options.stream && onChunk) {
      const reader = res.body?.getReader();
      if (!reader) throw new DeepSeekError("NO_BODY", "No response body for stream");

      const decoder = new TextDecoder();
      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content || "";
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      return fullContent;
    } else {
      const json: any = await res.json();
      const content = json.choices?.[0]?.message?.content || "";
      return content;
    }
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new DeepSeekError("TIMEOUT", "DeepSeek API request timed out");
    }
    throw err;
  }
}
