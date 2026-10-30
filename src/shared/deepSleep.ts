import { normalizeUrl } from "./url";

export interface DeepSleepPayload {
  version: 1;
  resourceId: string;
  url: string;
  title: string;
}

const LEGACY_PARKED_DEEP_SLEEP_HASH = "#tab-vault-deep-sleep=";
const PARKED_DEEP_SLEEP_PREFIX =
  "data:text/html;charset=utf-8,";
const PARKED_RESOURCE_META =
  '<meta name="tab-vault-resource-id" content="';

export const DEEP_SLEEP_FAVICON_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%235f7182%27/%3E%3Cpath d=%27M16 7v18M7 16h18M9.6 9.6l12.8 12.8M22.4 9.6 9.6 22.4%27 stroke=%27white%27 stroke-width=%272%27 stroke-linecap=%27round%27 opacity=%27.82%27/%3E%3C/svg%3E";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDeepSleepPageUrl(
  rawUrl: string,
  suspendedPageUrl: string,
): boolean {
  try {
    const candidate = new URL(rawUrl);
    const suspendedPage = new URL(suspendedPageUrl);
    return (
      candidate.origin === suspendedPage.origin &&
      candidate.pathname === suspendedPage.pathname
    );
  } catch {
    return false;
  }
}

export function createDeepSleepUrl(
  suspendedPageUrl: string,
  payload: DeepSleepPayload,
): string {
  if (
    payload.version !== 1 ||
    !isNonEmptyString(payload.resourceId) ||
    !isNonEmptyString(payload.title) ||
    normalizeUrl(payload.url) === null
  ) {
    throw new Error("Invalid deep sleep payload");
  }

  const url = new URL(suspendedPageUrl);
  url.hash = encodeURIComponent(JSON.stringify(payload));
  return url.toString();
}

export function parseDeepSleepPayload(
  rawUrl: string,
  suspendedPageUrl: string,
): DeepSleepPayload | null {
  if (!isDeepSleepPageUrl(rawUrl, suspendedPageUrl)) {
    return null;
  }

  try {
    const hash = new URL(rawUrl).hash.slice(1);
    if (!hash) {
      return null;
    }
    const value = JSON.parse(decodeURIComponent(hash)) as Record<
      string,
      unknown
    >;
    if (
      value.version !== 1 ||
      !isNonEmptyString(value.resourceId) ||
      !isNonEmptyString(value.url) ||
      !isNonEmptyString(value.title) ||
      normalizeUrl(value.url) === null
    ) {
      return null;
    }
    return {
      version: 1,
      resourceId: value.resourceId,
      url: value.url,
      title: value.title,
    };
  } catch {
    return null;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createParkedDeepSleepUrl(
  resourceId: string,
  title: string,
  faviconDataUrl: string,
): string {
  if (
    !isNonEmptyString(resourceId) ||
    !isNonEmptyString(title) ||
    !faviconDataUrl.startsWith("data:image/")
  ) {
    throw new Error("Invalid parked deep sleep resource");
  }
  const html = [
    "<!doctype html><meta charset=utf-8>",
    `${PARKED_RESOURCE_META}${escapeHtmlAttribute(resourceId)}">`,
    `<title>${escapeHtmlAttribute(title)}</title>`,
    `<link rel=icon href="${escapeHtmlAttribute(faviconDataUrl)}">`,
  ].join("");
  return `${PARKED_DEEP_SLEEP_PREFIX}${encodeURIComponent(html)}`;
}

export function isDisplayParkedDeepSleepUrl(rawUrl: string): boolean {
  return rawUrl.startsWith(PARKED_DEEP_SLEEP_PREFIX);
}

export function parseParkedDeepSleepResourceId(
  rawUrl: string,
): string | null {
  try {
    if (
      rawUrl.startsWith(
        `about:blank${LEGACY_PARKED_DEEP_SLEEP_HASH}`,
      )
    ) {
      const resourceId = decodeURIComponent(
        rawUrl.slice(
          `about:blank${LEGACY_PARKED_DEEP_SLEEP_HASH}`.length,
        ),
      );
      return isNonEmptyString(resourceId) ? resourceId : null;
    }
    if (!isDisplayParkedDeepSleepUrl(rawUrl)) {
      return null;
    }
    const html = decodeURIComponent(
      rawUrl.slice(PARKED_DEEP_SLEEP_PREFIX.length),
    );
    const markerIndex = html.indexOf(PARKED_RESOURCE_META);
    if (markerIndex < 0) {
      return null;
    }
    const valueStart = markerIndex + PARKED_RESOURCE_META.length;
    const valueEnd = html.indexOf('"', valueStart);
    if (valueEnd < 0) {
      return null;
    }
    const resourceId = html
      .slice(valueStart, valueEnd)
      .replaceAll("&quot;", '"')
      .replaceAll("&gt;", ">")
      .replaceAll("&lt;", "<")
      .replaceAll("&amp;", "&");
    return isNonEmptyString(resourceId) ? resourceId : null;
  } catch {
    return null;
  }
}
