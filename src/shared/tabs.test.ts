import { describe, expect, it } from "vitest";
import {
  isEligibleForDeepSleep,
  isSafeToDiscard,
  selectSafeDuplicateTabsToClose,
  shouldUseNativeDeepSleep,
} from "./tabs";
import type { TabInstance } from "./types";

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

function makeInstance(
  browserTabId: number,
  patch: Partial<TabInstance> = {},
): TabInstance {
  return {
    browserTabId,
    resourceId: "resource-1",
    windowId: 1,
    index: browserTabId,
    pinned: false,
    active: false,
    discarded: false,
    deepSleeping: false,
    audible: false,
    groupId: -1,
    lastAccessed: browserTabId,
    lastSeenAt: browserTabId,
    ...patch,
  };
}

describe("selectSafeDuplicateTabsToClose", () => {
  it("keeps a Chrome-grouped tab before an ungrouped duplicate", () => {
    const ungrouped = makeInstance(1, { lastAccessed: 2_000 });
    const grouped = makeInstance(2, { groupId: 7, lastAccessed: 1_000 });

    expect(
      selectSafeDuplicateTabsToClose([ungrouped, grouped]).map(
        (instance) => instance.browserTabId,
      ),
    ).toEqual([ungrouped.browserTabId]);
  });

  it("keeps the most recently used loaded tab when none are grouped", () => {
    const older = makeInstance(1, { lastAccessed: 1_000 });
    const latest = makeInstance(2, { lastAccessed: 2_000 });
    const sleeping = makeInstance(3, {
      discarded: true,
      lastAccessed: 3_000,
    });

    expect(
      selectSafeDuplicateTabsToClose([older, latest, sleeping]).map(
        (instance) => instance.browserTabId,
      ),
    ).toEqual([older.browserTabId, sleeping.browserTabId]);
  });

  it("never automatically closes active, pinned, or audible tabs", () => {
    const active = makeInstance(1, { active: true });
    const pinned = makeInstance(2, { pinned: true });
    const audible = makeInstance(3, { audible: true });
    const ordinary = makeInstance(4);

    expect(
      selectSafeDuplicateTabsToClose([
        active,
        pinned,
        audible,
        ordinary,
      ]).map((instance) => instance.browserTabId),
    ).toEqual([ordinary.browserTabId]);
  });
});

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

describe("isEligibleForDeepSleep", () => {
  it("accepts every operable web-tab state", () => {
    expect(isEligibleForDeepSleep(makeTab())).toBe(true);
    expect(isEligibleForDeepSleep(makeTab({ active: true }))).toBe(true);
    expect(isEligibleForDeepSleep(makeTab({ pinned: true }))).toBe(true);
    expect(isEligibleForDeepSleep(makeTab({ audible: true }))).toBe(true);
    expect(isEligibleForDeepSleep(makeTab({ discarded: true }))).toBe(true);
    expect(
      isEligibleForDeepSleep(makeTab({ status: "loading" })),
    ).toBe(true);
    expect(
      isEligibleForDeepSleep(makeTab({ autoDiscardable: false })),
    ).toBe(true);
  });

  it.each([
    ["missing ID", { id: undefined }],
    ["browser-internal", { url: "chrome://extensions" }],
  ])("rejects a %s tab", (_label, patch) => {
    expect(isEligibleForDeepSleep(makeTab(patch))).toBe(false);
  });
});

describe("shouldUseNativeDeepSleep", () => {
  it("uses Chrome native discard for ordinary background tabs", () => {
    expect(shouldUseNativeDeepSleep(makeTab())).toBe(true);
    expect(
      shouldUseNativeDeepSleep(makeTab({ autoDiscardable: false })),
    ).toBe(true);
  });

  it.each([
    ["active", { active: true }],
    ["pinned", { pinned: true }],
    ["audible", { audible: true }],
    ["loading", { status: "loading" as const }],
    ["already discarded", { discarded: true }],
  ])("keeps a placeholder for a %s tab", (_label, patch) => {
    expect(shouldUseNativeDeepSleep(makeTab(patch))).toBe(false);
  });
});
