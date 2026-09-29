import { describe, expect, it } from "vitest";
import {
  createDeepSleepUrl,
  isDeepSleepPageUrl,
  parseDeepSleepPayload,
} from "./deepSleep";

const suspendedPageUrl = "chrome-extension://extension-id/suspended.html";

describe("deep sleep payload", () => {
  it("round-trips Unicode titles and the original URL", () => {
    const payload = {
      version: 1 as const,
      resourceId: "resource_42",
      url: "https://example.com/report?id=42#结果",
      title: "治理结果 · 第四级",
    };
    const url = createDeepSleepUrl(suspendedPageUrl, payload);

    expect(isDeepSleepPageUrl(url, suspendedPageUrl)).toBe(true);
    expect(parseDeepSleepPayload(url, suspendedPageUrl)).toEqual(payload);
  });

  it("rejects unsupported target protocols", () => {
    expect(() =>
      createDeepSleepUrl(suspendedPageUrl, {
        version: 1,
        resourceId: "resource_42",
        url: "chrome://settings",
        title: "Settings",
      }),
    ).toThrow("Invalid deep sleep payload");
  });

  it("rejects malformed and unrelated placeholder URLs", () => {
    expect(
      parseDeepSleepPayload(
        `${suspendedPageUrl}#${encodeURIComponent('{"version":2}')}`,
        suspendedPageUrl,
      ),
    ).toBeNull();
    expect(
      parseDeepSleepPayload(
        "chrome-extension://extension-id/other.html",
        suspendedPageUrl,
      ),
    ).toBeNull();
  });
});
