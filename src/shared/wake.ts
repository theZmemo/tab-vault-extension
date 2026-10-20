import { isDeepSleepPageUrl } from "./deepSleep";
import { normalizeUrl } from "./url";

interface WakeableTab {
  id?: number;
  url?: string;
  pendingUrl?: string;
  discarded: boolean;
}

interface WakeTabActions {
  restoreDeepSleepingTab: (tabId: number) => Promise<boolean>;
  reloadTab: (tabId: number) => Promise<void>;
  markTabAwake: (tabId: number) => Promise<void>;
}

export async function wakeTab(
  tab: WakeableTab,
  suspendedPageUrl: string,
  actions: WakeTabActions,
): Promise<boolean> {
  if (tab.id === undefined) {
    return false;
  }
  const url = tab.pendingUrl ?? tab.url ?? "";
  if (isDeepSleepPageUrl(url, suspendedPageUrl)) {
    return actions.restoreDeepSleepingTab(tab.id);
  }
  if (!tab.discarded || !normalizeUrl(url)) {
    return false;
  }

  await actions.reloadTab(tab.id);
  await actions.markTabAwake(tab.id);
  return true;
}
