import { t } from "./i18n";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "spm",
  "spm_id_from",
  "yclid",
]);

const BLOCKED_PROTOCOLS = new Set([
  "about:",
  "chrome:",
  "chrome-extension:",
  "data:",
  "devtools:",
  "edge:",
  "javascript:",
]);

export interface NormalizedUrl {
  originalUrl: string;
  normalizedUrl: string;
  domain: string;
}

export function normalizeUrl(rawUrl: string): NormalizedUrl | null {
  if (!rawUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
    return null;
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  const sortedEntries = [...parsed.searchParams.entries()]
    .filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return (
        !normalizedKey.startsWith("utm_") &&
        !TRACKING_PARAMETERS.has(normalizedKey)
      );
    })
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyOrder = keyA.localeCompare(keyB);
      return keyOrder === 0 ? valueA.localeCompare(valueB) : keyOrder;
    });

  parsed.search = "";
  for (const [key, value] of sortedEntries) {
    parsed.searchParams.append(key, value);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return {
    originalUrl: rawUrl,
    normalizedUrl: parsed.toString(),
    domain: parsed.hostname || t("localFile"),
  };
}

export async function createDedupeKey(normalizedUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function splitRuleValues(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
