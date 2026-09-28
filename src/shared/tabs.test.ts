import { describe, expect, it } from "vitest";
import { isSafeToDeepSleep, isSafeToDiscard } from "./tabs";

function makeTab(
  patch: Partial<chrome.tabs.Tab> = {},
): chrome.tabs.Tab {
  return {
    id: 42,
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    autoDiscardable: true,
    status: "complete",
    lastAccessed: 1_000,
    url: "https://example.com/report",
    ...patch,
  } as chrome.tabs.Tab;
}

describe("isSafeToDiscard", () => {
  it("accepts an inactive, persisted web tab", () => {
    expect(isSafeToDiscard(makeTab(), 2_000)).toBe(true);
  });

  it.each([
    ["active", { active: true }],
    ["pinned", { pinned: true }],
    ["audible", { audible: true }],
    ["already discarded", { discarded: true }],
    ["not auto-discardable", { autoDiscardable: false }],
    ["loading", { status: "loading" as const }],
  ])("rejects a %s tab", (_label, patch) => {
    expect(isSafeToDiscard(makeTab(patch), 2_000)).toBe(false);
  });

  it("rejects recent and browser-internal tabs", () => {
    expect(isSafeToDiscard(makeTab({ lastAccessed: 3_000 }), 2_000)).toBe(
      false,
    );
    expect(
      isSafeToDiscard(makeTab({ url: "chrome://extensions" }), 2_000),
    ).toBe(false);
  });

  it("allows an explicit force action to ignore auto-discard limits", () => {
    expect(
      isSafeToDiscard(makeTab({ autoDiscardable: false }), 2_000, {
        respectAutoDiscardable: false,
      }),
    ).toBe(true);
  });
});

describe("isSafeToDeepSleep", () => {
  it("accepts both running and natively discarded background tabs", () => {
    expect(isSafeToDeepSleep(makeTab())).toBe(true);
    expect(isSafeToDeepSleep(makeTab({ discarded: true }))).toBe(true);
  });

  it.each([
    ["active", { active: true }],
    ["pinned", { pinned: true }],
    ["audible", { audible: true }],
    ["loading", { status: "loading" as const }],
    ["browser-internal", { url: "chrome://extensions" }],
  ])("rejects a %s tab", (_label, patch) => {
    expect(isSafeToDeepSleep(makeTab(patch))).toBe(false);
  });

  it("ignores the browser auto-discard flag for a manual deep sleep", () => {
    expect(
      isSafeToDeepSleep(makeTab({ autoDiscardable: false })),
    ).toBe(true);
  });
});
