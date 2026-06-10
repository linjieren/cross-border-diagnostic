export interface YouTubeMetadata {
  videoId: string;
  watchUrl: string;
  title: string;
  channelName: string;
  channelAvatarUrl?: string;
  thumbnailUrl: string;
  duration?: string;
}

interface YouTubeOEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface YouTubeCandidate {
  videoId: string;
  duration?: string;
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const cache = new Map<string, { expiresAt: number; data: YouTubeMetadata }>();

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseYouTubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
      if (embedMatch) return embedMatch[1];
      const shortMatch = url.pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
      if (shortMatch) return shortMatch[1];
    }
  } catch {
    const loose = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return loose?.[1] || null;
  }
  return null;
}

function buildSearchUrl(title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;
}

function getSearchQuery(urlValue: string, title?: string): string {
  try {
    const url = new URL(urlValue);
    const query = url.searchParams.get("search_query");
    if (query) return query;
  } catch {
    // Fall through to title.
  }
  return title || "";
}

function extractMeta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return undefined;
}

function extractJsonString(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\"/g, "\"");
  }
}

function extractJsonNumberString(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`"${escaped}"\\s*:\\s*(\\d+)`, "i"));
  return match?.[1];
}

function extractItemPropContent(html: string, itemprop: string): string | undefined {
  const escaped = itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return undefined;
}

function formatDuration(secondsValue?: string): string | undefined {
  const seconds = secondsValue ? Number.parseInt(secondsValue, 10) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatIsoDuration(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return undefined;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  return formatDuration(String(hours * 3600 + minutes * 60 + seconds));
}

function extractDuration(html: string): string | undefined {
  const lengthSeconds = extractJsonString(html, "lengthSeconds") || extractJsonNumberString(html, "lengthSeconds");
  const durationFromLength = formatDuration(lengthSeconds);
  if (durationFromLength) return durationFromLength;

  const approxDurationMs = extractJsonNumberString(html, "approxDurationMs");
  const durationFromApprox = approxDurationMs
    ? formatDuration(String(Math.round(Number.parseInt(approxDurationMs, 10) / 1000)))
    : undefined;
  if (durationFromApprox) return durationFromApprox;

  return formatIsoDuration(extractItemPropContent(html, "duration"));
}

function extractSearchDuration(html: string, videoId: string): string | undefined {
  const anchor = html.indexOf(`"videoId":"${videoId}"`);
  if (anchor < 0) return undefined;

  const slice = html.slice(anchor, anchor + 8000);
  const simpleTextMatch = slice.match(/"lengthText"\s*:\s*\{[\s\S]{0,900}?"simpleText"\s*:\s*"([^"]+)"/);
  if (simpleTextMatch?.[1]) return decodeHtmlEntities(simpleTextMatch[1]);

  const labelMatch = slice.match(/"lengthText"\s*:\s*\{[\s\S]{0,900}?"label"\s*:\s*"([^"]+)"/);
  if (!labelMatch?.[1]) return undefined;

  const label = decodeHtmlEntities(labelMatch[1]);
  const hours = label.match(/(\d+)\s+hour/);
  const minutes = label.match(/(\d+)\s+minute/);
  const seconds = label.match(/(\d+)\s+second/);
  return formatDuration(
    String(
      (hours ? Number.parseInt(hours[1], 10) * 3600 : 0) +
        (minutes ? Number.parseInt(minutes[1], 10) * 60 : 0) +
        (seconds ? Number.parseInt(seconds[1], 10) : 0)
    )
  );
}

function extractAvatarUrl(html: string): string | undefined {
  const avatarMatch =
    html.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/) ||
    html.match(/"channelThumbnail"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);
  if (!avatarMatch?.[1]) return undefined;
  try {
    return JSON.parse(`"${avatarMatch[1]}"`).replace(/\\u0026/g, "&");
  } catch {
    return avatarMatch[1].replace(/\\u0026/g, "&");
  }
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`YouTube request failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveVideoCandidate(urlValue: string, title?: string): Promise<YouTubeCandidate | null> {
  const direct = parseYouTubeId(urlValue);
  if (direct) return { videoId: direct };

  const query = getSearchQuery(urlValue, title).trim();
  if (!query) return null;

  const html = await fetchText(buildSearchUrl(query));
  const match = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{6,})"/);
  if (!match?.[1]) return null;

  return {
    videoId: match[1],
    duration: extractSearchDuration(html, match[1]),
  };
}

export async function getYouTubeMetadata(urlValue: string, title?: string): Promise<YouTubeMetadata | null> {
  const cacheKey = `${urlValue}|${title || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const candidate = await resolveVideoCandidate(urlValue, title);
  if (!candidate) return null;

  const { videoId } = candidate;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oEmbed = await fetchJson<YouTubeOEmbed>(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
  );
  const html = await fetchText(watchUrl);

  const titleText =
    oEmbed?.title ||
    extractMeta(html, "og:title") ||
    extractJsonString(html, "title") ||
    title ||
    "YouTube tutorial";

  const channelName =
    oEmbed?.author_name ||
    extractJsonString(html, "ownerChannelName") ||
    extractJsonString(html, "author") ||
    "YouTube";

  const thumbnailUrl =
    oEmbed?.thumbnail_url ||
    extractMeta(html, "og:image") ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const data: YouTubeMetadata = {
    videoId,
    watchUrl,
    title: titleText,
    channelName,
    channelAvatarUrl: extractAvatarUrl(html),
    thumbnailUrl,
    duration: extractDuration(html) || candidate.duration,
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
