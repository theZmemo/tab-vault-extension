import { normalizeUrl } from "./url";
import type { TabInstance } from "./types";

function compareDuplicateRetention(
  left: TabInstance,
  right: TabInstance,
): number {
  const groupedOrder =
    Number(right.groupId >= 0) - Number(left.groupId >= 0);
  if (groupedOrder !== 0) {
    return groupedOrder;
  }

  const loadedOrder =
    Number(!right.discarded && !right.deepSleeping) -
    Number(!left.discarded && !left.deepSleeping);
  if (loadedOrder !== 0) {
    return loadedOrder;
  }

  return (
    right.lastAccessed - left.lastAccessed ||
    right.lastSeenAt - left.lastSeenAt ||
    left.browserTabId - right.browserTabId
  );
}

export function selectSafeDuplicateTabsToClose(
  instances: readonly TabInstance[],
): TabInstance[] {
  if (instances.length <= 1) {
    return [];
  }

  const sensitiveInstances = instances.filter(
    (instance) => instance.active || instance.pinned || instance.audible,
  );
  const closableInstances = instances
    .filter(
      (instance) =>
        !instance.active && !instance.pinned && !instance.audible,
    )
    .sort(compareDuplicateRetention);

  return sensitiveInstances.length > 0
    ? closableInstances
    : closableInstances.slice(1);
}

export function isSafeToDiscard(
  tab: chrome.tabs.Tab,
  cutoff: number,
  options: { respectAutoDiscardable?: boolean } = {},
): tab is chrome.tabs.Tab & { id: number } {
  const respectAutoDiscardable = options.respectAutoDiscardable ?? true;
  return Boolean(
    tab.id !== undefined &&
      !tab.active &&
      !tab.pinned &&
      !tab.audible &&
      !tab.discarded &&
      (!respectAutoDiscardable || tab.autoDiscardable !== false) &&
      tab.status !== "loading" &&
      (tab.lastAccessed ?? Date.now()) <= cutoff &&
      normalizeUrl(tab.url ?? "") !== null,
  );
}

export function isEligibleForDeepSleep(
  tab: chrome.tabs.Tab,
): tab is chrome.tabs.Tab & { id: number } {
  return Boolean(
    tab.id !== undefined &&
      normalizeUrl(tab.pendingUrl ?? tab.url ?? "") !== null,
  );
}

export function shouldUseNativeDeepSleep(tab: chrome.tabs.Tab): boolean {
  return isSafeToDiscard(tab, Number.POSITIVE_INFINITY, {
    respectAutoDiscardable: false,
  });
}
