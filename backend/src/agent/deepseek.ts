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
  /** 单次请求超时（毫秒），默认 60000。长报告生成等场景可传更大值。 */
  timeoutMs?: number;
}

export class DeepSeekError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 500;

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  // 已包含 /v1 的地址不再重复拼接，避免 /v1/v1/chat/completions
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof DeepSeekError) {
    // 仅 5xx / 429 / 超时重试，4xx 是请求本身的问题，重试无意义
    if (err.code === "TIMEOUT") return true;
    const match = /^HTTP_(\d+)$/.exec(err.code);
    if (!match) return false;
    const status = Number(match[1]);
    return status === 429 || status >= 500;
  }
  // fetch 的网络层错误（TypeError: fetch failed、ECONNRESET 等）
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(
  url: string,
  apiKey: string,
  body: any,
  timeoutMs: number,
  stream: boolean,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
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

    if (stream && onChunk) {
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
    }

    const json: any = await res.json();
    return json.choices?.[0]?.message?.content || "";
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new DeepSeekError("TIMEOUT", "DeepSeek API request timed out");
    }
    throw err;
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
  const baseUrl = normalizeBaseUrl(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  const url = `${baseUrl}/chat/completions`;
  const stream = options.stream ?? false;

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestOnce(url, apiKey, body, timeoutMs, stream, onChunk);
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_RETRIES || !isRetryableError(err)) {
        throw err;
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `DeepSeek request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
