import { describe, expect, it } from "vitest";
import { resolveUiLocale, translateForLocale } from "./i18n";

describe("resolveUiLocale", () => {
  it("uses Chinese for Chinese browser locales", () => {
    expect(resolveUiLocale("zh-CN")).toBe("zh-CN");
    expect(resolveUiLocale("zh-TW")).toBe("zh-CN");
  });

  it("falls back to English for other browser locales", () => {
    expect(resolveUiLocale("en-US")).toBe("en");
    expect(resolveUiLocale("ja-JP")).toBe("en");
  });
});

describe("translateForLocale", () => {
  it("renders translated messages with parameters", () => {
    expect(
      translateForLocale("zh-CN", "resourceCount", { count: 12 }),
    ).toBe("12 个资源");
    expect(
      translateForLocale("en-US", "resourceCount", { count: 12 }),
    ).toBe("12 resources");
  });
});
