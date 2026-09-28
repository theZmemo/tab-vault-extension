import { normalizeUrl } from "./url";

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
