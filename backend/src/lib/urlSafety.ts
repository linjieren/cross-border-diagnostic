import { promises as dns } from "dns";
import { isIP } from "net";

export class UrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "metadata.google.internal",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF + 192.0.2.0/24 TEST-NET
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/4, 240.0.0.0/4)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  let normalized = ip.toLowerCase();
  // IPv4-mapped / IPv4-compatible forms: check the embedded IPv4 address
  const mapped = normalized.match(/^(::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[2]);
  if (normalized === "::" || normalized === "::1") return true; // unspecified / loopback
  const first = normalized.split(":")[0];
  const firstInt = parseInt(first || "0", 16);
  if (firstInt >= 0xfc00 && firstInt <= 0xfdff) return true; // fc00::/7 unique local
  if (firstInt >= 0xfe80 && firstInt <= 0xfebf) return true; // fe80::/10 link-local
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // unparseable address: refuse
}

/**
 * 校验目标 URL 是否为可安全访问的公网地址（防 SSRF）。
 * 解析失败、非 http/https 协议、或解析到私有/保留/回环/链路本地地址时抛 UrlSafetyError。
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlSafetyError("invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlSafetyError("only http/https URLs are allowed");
  }

  // WHATWG URL 保留 IPv6 字面量的方括号，去掉后再判断
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new UrlSafetyError(`hostname not allowed: ${hostname}`);
  }

  // IP 字面量直接判断，不走 DNS
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UrlSafetyError(`IP address not allowed: ${hostname}`);
    }
    return;
  }

  // 域名做 DNS 解析（含 /etc/hosts），所有解析结果都必须是公网地址
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlSafetyError(`hostname could not be resolved: ${hostname}`);
  }
  if (!addresses.length) {
    throw new UrlSafetyError(`hostname could not be resolved: ${hostname}`);
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new UrlSafetyError(`hostname resolves to a non-public address: ${hostname}`);
    }
  }
}
