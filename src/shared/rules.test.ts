import { describe, expect, it } from "vitest";
import type { Resource, Rule } from "./types";
import { matchesRule } from "./rules";

const resource: Resource = {
  id: "resource-1",
  originalUrl: "https://sql.example.com/docs/governance?id=42",
  normalizedUrl: "https://sql.example.com/docs/governance?id=42",
  dedupeKey: "key",
  title: "治理任务校验 SQL",
  domain: "sql.example.com",
  createdAt: 1,
  updatedAt: 1,
  lastVisitedAt: 1,
  visitCount: 1,
  protected: false,
  notes: "",
};

function makeRule(patch: Partial<Rule> = {}): Rule {
  return {
    id: "rule-1",
    name: "数据治理",
    collectionId: "collection-1",
    enabled: true,
    priority: 1,
    matchMode: "any",
    domains: [],
    titleKeywords: [],
    urlKeywords: [],
    excludedDomains: [],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe("matchesRule", () => {
  it("matches a parent domain and title keyword in any mode", () => {
    expect(
      matchesRule(
        resource,
        makeRule({
          domains: ["example.com"],
          titleKeywords: ["unmatched"],
        }),
      ),
    ).toBe(true);
  });

  it("requires every populated condition group in all mode", () => {
    expect(
      matchesRule(
        resource,
        makeRule({
          matchMode: "all",
          domains: ["*.example.com"],
          titleKeywords: ["治理", "other"],
          urlKeywords: ["/docs/"],
        }),
      ),
    ).toBe(true);

    expect(
      matchesRule(
        resource,
        makeRule({
          matchMode: "all",
          domains: ["example.com"],
          titleKeywords: ["not-found"],
        }),
      ),
    ).toBe(false);
  });

  it("applies excluded domains before positive conditions", () => {
    expect(
      matchesRule(
        resource,
        makeRule({
          domains: ["example.com"],
          excludedDomains: ["sql.example.com"],
        }),
      ),
    ).toBe(false);
  });

  it("does not match an empty or disabled rule", () => {
    expect(matchesRule(resource, makeRule())).toBe(false);
    expect(
      matchesRule(
        resource,
        makeRule({ enabled: false, titleKeywords: ["治理"] }),
      ),
    ).toBe(false);
  });
});
