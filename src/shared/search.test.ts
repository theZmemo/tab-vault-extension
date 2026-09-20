import { describe, expect, it } from "vitest";
import type { Resource } from "./types";
import { matchesResourceSubstring } from "./search";

const resource: Resource = {
  id: "resource-1",
  originalUrl: "https://data.example.com/report",
  normalizedUrl: "https://data.example.com/report",
  dedupeKey: "dedupe-1",
  title: "「G1」GMV/CPO兑换比样例",
  customTitle: "治理兑换参考",
  domain: "data.example.com",
  createdAt: 1,
  updatedAt: 1,
  lastVisitedAt: 1,
  visitCount: 1,
  protected: false,
  notes: "季度分析",
};

describe("matchesResourceSubstring", () => {
  it("matches a Chinese phrase in the middle of a continuous title", () => {
    expect(matchesResourceSubstring(resource, "兑换")).toBe(true);
  });

  it("matches custom titles and multiple terms across fields", () => {
    expect(matchesResourceSubstring(resource, "治理 季度")).toBe(true);
  });

  it("returns false when no indexed field contains the query", () => {
    expect(matchesResourceSubstring(resource, "供应链")).toBe(false);
  });
});
