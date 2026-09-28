import { normalizeUrl } from "./url";

export function isSafeToDiscard(
  tab: chrome.tabs.Tab,
  cutoff: number,
): tab is chrome.tabs.Tab & { id: number } {
  return Boolean(
    tab.id !== undefined &&
      !tab.active &&
      !tab.pinned &&
      !tab.audible &&
      !tab.discarded &&
      tab.autoDiscardable !== false &&
      tab.status !== "loading" &&
      (tab.lastAccessed ?? Date.now()) <= cutoff &&
      normalizeUrl(tab.url ?? "") !== null,
  );
}
