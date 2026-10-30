import { describe, expect, it } from "vitest";
import {
  DEEP_SLEEP_FAVICON_DATA_URL,
  createDeepSleepUrl,
  createParkedDeepSleepUrl,
  isDisplayParkedDeepSleepUrl,
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
  it("uses a local gray sleep indicator", () => {
    expect(DEEP_SLEEP_FAVICON_DATA_URL).toContain(
      "data:image/svg+xml",
    );
    expect(DEEP_SLEEP_FAVICON_DATA_URL).toContain("%235f7182");
    expect(DEEP_SLEEP_FAVICON_DATA_URL).toContain(
      "M16 7v18M7 16h18",
    );
  });

  it("round-trips the resource ID and preserves display metadata", () => {
    const parkedUrl = createParkedDeepSleepUrl(
      "resource_治理 42",
      '治理报告 "周会" · 深度休眠',
      "data:image/png;base64,aWNvbg==",
    );

    expect(isDisplayParkedDeepSleepUrl(parkedUrl)).toBe(true);
    const parkedHtml = decodeURIComponent(parkedUrl.split(",", 2)[1]);
    expect(parkedHtml).toContain(
      "<title>治理报告 &quot;周会&quot; · 深度休眠</title>",
    );
    expect(parkedHtml).toContain("data:image/png;base64,aWNvbg==");
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
    expect(() =>
      createParkedDeepSleepUrl(
        "  ",
        "Title",
        "data:image/png;base64,aWNvbg==",
      ),
    ).toThrow("Invalid parked deep sleep resource");
  });

  it("reads legacy blank parking URLs", () => {
    expect(
      parseParkedDeepSleepResourceId(
        "about:blank#tab-vault-deep-sleep=resource_legacy",
      ),
    ).toBe("resource_legacy");
  });
});
