import { normalizeUrl } from "./url";

export interface DeepSleepPayload {
  version: 1;
  resourceId: string;
  url: string;
  title: string;
  initiallyActive?: boolean;
}

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
    (payload.initiallyActive !== undefined &&
      typeof payload.initiallyActive !== "boolean") ||
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
      (value.initiallyActive !== undefined &&
        typeof value.initiallyActive !== "boolean") ||
      normalizeUrl(value.url) === null
    ) {
      return null;
    }
    return {
      version: 1,
      resourceId: value.resourceId,
      url: value.url,
      title: value.title,
      initiallyActive: value.initiallyActive,
    };
  } catch {
    return null;
  }
}
