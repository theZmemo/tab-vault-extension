import { describe, expect, it } from "vitest";
import {
  createDeepSleepUrl,
  createParkedDeepSleepUrl,
  isDeepSleepPageUrl,
  parseDeepSleepPayload,
  parseParkedDeepSleepResourceId,
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

describe("parked deep sleep URL", () => {
  it("round-trips the resource ID without exposing the original URL", () => {
    const parkedUrl = createParkedDeepSleepUrl("resource_治理 42");

    expect(parkedUrl.startsWith("about:blank#tab-vault-deep-sleep=")).toBe(
      true,
    );
    expect(parkedUrl).not.toContain("example.com");
    expect(parseParkedDeepSleepResourceId(parkedUrl)).toBe(
      "resource_治理 42",
    );
  });

  it("rejects unrelated and malformed parked URLs", () => {
    expect(parseParkedDeepSleepResourceId("about:blank")).toBeNull();
    expect(
      parseParkedDeepSleepResourceId(
        "about:blank#tab-vault-deep-sleep=%E0%A4%A",
      ),
    ).toBeNull();
    expect(() => createParkedDeepSleepUrl("  ")).toThrow(
      "Invalid parked deep sleep resource",
    );
  });
});
