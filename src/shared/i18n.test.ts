import { describe, expect, it } from "vitest";
import {
  englishMessages,
  resolveUiLocale,
  SUPPORTED_UI_LOCALES,
  translateForLocale,
} from "./i18n";

describe("resolveUiLocale", () => {
  it("distinguishes simplified and traditional Chinese", () => {
    expect(resolveUiLocale("zh-CN")).toBe("zh-CN");
    expect(resolveUiLocale("zh-SG")).toBe("zh-CN");
    expect(resolveUiLocale("zh-TW")).toBe("zh-TW");
    expect(resolveUiLocale("zh-Hant-HK")).toBe("zh-TW");
  });

  it.each([
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["es-MX", "es"],
    ["fr-CA", "fr"],
    ["de-AT", "de"],
    ["pt-PT", "pt-BR"],
    ["ru-RU", "ru"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(resolveUiLocale(input)).toBe(expected);
  });

  it("falls back to English for unsupported browser locales", () => {
    expect(resolveUiLocale("en-US")).toBe("en");
    expect(resolveUiLocale("hi-IN")).toBe("en");
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

  it("provides complete parameterized messages for every locale", () => {
    for (const locale of SUPPORTED_UI_LOCALES) {
      const resourceCount = translateForLocale(locale, "resourceCount", {
        count: 12,
      });
      const editGroup = translateForLocale(locale, "editGroup", {
        name: "Research",
      });
      expect(resourceCount).toContain("12");
      expect(resourceCount).not.toContain("{count}");
      expect(editGroup).toContain("Research");
      expect(editGroup).not.toContain("{name}");
      expect(translateForLocale(locale, "appName")).not.toHaveLength(0);
    }
  });

  it("preserves every interpolation placeholder in every locale", () => {
    for (const [key, source] of Object.entries(englishMessages)) {
      const placeholders = [...source.matchAll(/\{(\w+)\}/g)].map(
        (match) => match[1],
      );
      const params = Object.fromEntries(
        placeholders.map((placeholder) => [placeholder, `TEST_${placeholder}`]),
      );
      for (const locale of SUPPORTED_UI_LOCALES) {
        const translated = translateForLocale(
          locale,
          key as keyof typeof englishMessages,
          params,
        );
        for (const placeholder of placeholders) {
          expect(translated).toContain(`TEST_${placeholder}`);
        }
      }
    }
  });
});
