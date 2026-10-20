import { describe, expect, it, vi } from "vitest";
import { createDeepSleepUrl } from "./deepSleep";
import { wakeTab } from "./wake";

const suspendedPageUrl = "chrome-extension://test/suspended.html";

function makeActions() {
  return {
    restoreDeepSleepingTab: vi.fn(async () => true),
    reloadTab: vi.fn(async () => undefined),
    markTabAwake: vi.fn(async () => undefined),
  };
}

describe("wakeTab", () => {
  it("restores deep sleep through its recovery path", async () => {
    const actions = makeActions();
    const url = createDeepSleepUrl(suspendedPageUrl, {
      version: 1,
      resourceId: "resource-1",
      url: "https://example.com/deep",
      title: "Deep",
    });

    await expect(
      wakeTab({ id: 11, url, discarded: false }, suspendedPageUrl, actions),
    ).resolves.toBe(true);
    expect(actions.restoreDeepSleepingTab).toHaveBeenCalledWith(11);
    expect(actions.reloadTab).not.toHaveBeenCalled();
    expect(actions.markTabAwake).not.toHaveBeenCalled();
  });

  it("reloads a native discarded tab in place and marks it awake", async () => {
    const actions = makeActions();

    await expect(
      wakeTab(
        { id: 12, url: "https://example.com/native", discarded: true },
        suspendedPageUrl,
        actions,
      ),
    ).resolves.toBe(true);
    expect(actions.reloadTab).toHaveBeenCalledWith(12);
    expect(actions.markTabAwake).toHaveBeenCalledWith(12);
    expect(actions.restoreDeepSleepingTab).not.toHaveBeenCalled();
  });

  it("skips active, archived, and unsupported resources", async () => {
    const actions = makeActions();

    await expect(
      wakeTab(
        { id: 13, url: "https://example.com/open", discarded: false },
        suspendedPageUrl,
        actions,
      ),
    ).resolves.toBe(false);
    await expect(
      wakeTab({ id: 14, url: "chrome://settings", discarded: true }, suspendedPageUrl, actions),
    ).resolves.toBe(false);
    await expect(
      wakeTab({ discarded: true }, suspendedPageUrl, actions),
    ).resolves.toBe(false);
    expect(actions.reloadTab).not.toHaveBeenCalled();
    expect(actions.markTabAwake).not.toHaveBeenCalled();
    expect(actions.restoreDeepSleepingTab).not.toHaveBeenCalled();
  });
});
