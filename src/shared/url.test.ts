import { describe, expect, it } from "vitest";
import { createDedupeKey, normalizeUrl, splitRuleValues } from "./url";

describe("normalizeUrl", () => {
  it("removes tracking parameters and sorts remaining parameters", () => {
    const result = normalizeUrl(
      "https://Example.com:443/report/?b=2&utm_source=test&a=1#detail",
    );

    expect(result).toEqual({
      originalUrl:
        "https://Example.com:443/report/?b=2&utm_source=test&a=1#detail",
      normalizedUrl: "https://example.com/report?a=1&b=2#detail",
      domain: "example.com",
    });
  });

  it("preserves document identifiers and SPA fragments", () => {
    expect(normalizeUrl("https://docs.example.com/view?id=123#section")?.normalizedUrl)
      .toBe("https://docs.example.com/view?id=123#section");
    expect(normalizeUrl("https://docs.example.com/view?id=456#section")?.normalizedUrl)
      .toBe("https://docs.example.com/view?id=456#section");
  });

  it("blocks browser internal pages", () => {
    expect(normalizeUrl("chrome://settings")).toBeNull();
    expect(normalizeUrl("edge://extensions")).toBeNull();
  });
});

describe("createDedupeKey", () => {
  it("returns stable keys for equal normalized URLs", async () => {
    const first = await createDedupeKey("https://example.com/a");
    const second = await createDedupeKey("https://example.com/a");
    const third = await createDedupeKey("https://example.com/b");

    expect(first).toBe(second);
    expect(first).not.toBe(third);
    expect(first).toHaveLength(64);
  });
});

describe("splitRuleValues", () => {
  it("accepts Chinese commas, commas and newlines", () => {
    expect(splitRuleValues("example.com，docs.test\n SQL ")).toEqual([
      "example.com",
      "docs.test",
      "SQL",
    ]);
  });
});
