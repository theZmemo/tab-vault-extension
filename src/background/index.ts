import {
  appendEvent,
  db,
  ensureDatabaseDefaults,
  getVaultState,
  makeId,
  membershipId,
} from "../shared/db";
import { parseVaultExport } from "../shared/backup";
import { sortCollections } from "../shared/collections";
import {
  createDeepSleepUrl,
  isDeepSleepPageUrl,
  parseDeepSleepPayload,
} from "../shared/deepSleep";
import { t } from "../shared/i18n";
import { matchesRule } from "../shared/rules";
import { normalizeSettings } from "../shared/settings";
import { isEligibleForDeepSleep, isSafeToDiscard } from "../shared/tabs";
import type {
  Collection,
  CollectionMembership,
  DeepSleepRecovery,
  Resource,
  Rule,
  Snapshot,
  SnapshotTab,
  TabInstance,
  VaultCommand,
  VaultExport,
  VaultResponse,
  VaultSettings,
} from "../shared/types";
import { createDedupeKey, normalizeUrl } from "../shared/url";

const MAINTENANCE_ALARM = "tab-vault-maintenance";
const CONTEXT_MENU_ROOT = "tab-vault:add-to-group";
const CONTEXT_MENU_OPEN = "tab-vault:open";
const CONTEXT_MENU_COLLECTION_PREFIX = "tab-vault:collection:";
const SUSPENDED_PAGE_URL = chrome.runtime.getURL("suspended.html");
const DEEP_SLEEP_CLOSE_CONFIRMATION_MS = 3_000;
const captureQueue = new Map<number, Promise<void>>();
let bootstrapPromise: Promise<void> | null = null;

async function broadcastChange(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "VAULT_DATA_CHANGED" });
  } catch {
    // The side panel is normally closed, so no receiver is expected.
  }
}

function getContextMenuContexts(): [
  `${chrome.contextMenus.ContextType}`,
  ...`${chrome.contextMenus.ContextType}`[],
] {
  const majorVersion = Number(
    navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/)?.[1] ?? 0,
  );
  const contexts: `${chrome.contextMenus.ContextType}`[] = ["page", "action"];
  if (majorVersion >= 149) {
    contexts.push("tab");
  }
  return contexts as [
    `${chrome.contextMenus.ContextType}`,
    ...`${chrome.contextMenus.ContextType}`[],
  ];
}

function createContextMenu(
  properties: chrome.contextMenus.CreateProperties,
): void {
  chrome.contextMenus.create(properties, () => {
    void chrome.runtime.lastError;
  });
}

async function rebuildContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const [collections, memberships, resources, settings] = await Promise.all([
    db.collections.toArray(),
    db.memberships.toArray(),
    db.resources.toArray(),
    ensureDatabaseDefaults(),
  ]);
  const sortedCollections = sortCollections(
    collections,
    memberships,
    resources,
    settings.collectionSort,
  );
  const contexts = getContextMenuContexts();

  if (sortedCollections.length > 0) {
    createContextMenu({
      id: CONTEXT_MENU_ROOT,
      title: t("contextAddToGroup"),
      contexts,
    });
    for (const collection of sortedCollections) {
      createContextMenu({
        id: `${CONTEXT_MENU_COLLECTION_PREFIX}${collection.id}`,
        parentId: CONTEXT_MENU_ROOT,
        title: collection.name,
        contexts,
      });
    }
    createContextMenu({
      id: CONTEXT_MENU_OPEN,
      parentId: CONTEXT_MENU_ROOT,
      title: t("contextManageGroups"),
      contexts,
    });
  } else {
    createContextMenu({
      id: CONTEXT_MENU_OPEN,
      title: t("contextCreateGroup"),
      contexts,
    });
  }
}

async function openSidePanel(tab?: chrome.tabs.Tab): Promise<void> {
  if (tab?.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
    return;
  }
  if (tab?.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  const currentWindow = await chrome.windows.getCurrent();
  if (currentWindow.id !== undefined) {
    await chrome.sidePanel.open({ windowId: currentWindow.id });
  }
}

async function captureDeepSleepingTab(
  tab: chrome.tabs.Tab & { id: number },
  rawUrl: string,
): Promise<Resource | null> {
  const payload = parseDeepSleepPayload(rawUrl, SUSPENDED_PAGE_URL);
  const previousInstance = await db.tabInstances.get(tab.id);
  let resource = previousInstance
    ? await db.resources.get(previousInstance.resourceId)
    : undefined;

  if (!resource && payload) {
    resource = await db.resources.get(payload.resourceId);
  }

  if (!resource && payload) {
    const normalized = normalizeUrl(payload.url);
    if (!normalized) {
      return null;
    }
    const dedupeKey = await createDedupeKey(normalized.normalizedUrl);
    resource = await db.resources.where("dedupeKey").equals(dedupeKey).first();
    if (!resource) {
      const now = Date.now();
      resource = {
        id: payload.resourceId,
        originalUrl: normalized.originalUrl,
        normalizedUrl: normalized.normalizedUrl,
        dedupeKey,
        title: payload.title,
        domain: normalized.domain,
        createdAt: now,
        updatedAt: now,
        lastVisitedAt: tab.lastAccessed ?? now,
        visitCount: 1,
        protected: false,
        notes: "",
      };
      await db.resources.put(resource);
    }
  }

  if (!resource) {
    return null;
  }

  const now = Date.now();
  const instance: TabInstance = {
    browserTabId: tab.id,
    resourceId: resource.id,
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
    active: tab.active,
    discarded: false,
    deepSleeping: true,
    audible: tab.audible ?? false,
    groupId: tab.groupId,
    lastAccessed: tab.lastAccessed ?? previousInstance?.lastAccessed ?? now,
    lastSeenAt: now,
  };
  await db.tabInstances.put(instance);
  return resource;
}

async function captureTab(
  tab: chrome.tabs.Tab,
  eventType: "TAB_CAPTURED" | "RESOURCE_RESTORED" = "TAB_CAPTURED",
  notify = true,
): Promise<Resource | null> {
  if (tab.id === undefined) {
    return null;
  }

  const rawUrl = tab.pendingUrl ?? tab.url ?? "";
  if (isDeepSleepPageUrl(rawUrl, SUSPENDED_PAGE_URL)) {
    const resource = await captureDeepSleepingTab(
      tab as chrome.tabs.Tab & { id: number },
      rawUrl,
    );
    if (notify) {
      await broadcastChange();
    }
    return resource;
  }

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    await db.tabInstances.delete(tab.id);
    return null;
  }

  const now = Date.now();
  const dedupeKey = await createDedupeKey(normalized.normalizedUrl);
  let capturedResource: Resource | null = null;

  await db.transaction(
    "rw",
    db.resources,
    db.tabInstances,
    db.memberships,
    db.rules,
    db.events,
    async () => {
      const previousInstance = await db.tabInstances.get(tab.id!);
      let resource = await db.resources
        .where("dedupeKey")
        .equals(dedupeKey)
        .first();

      const isNewVisit =
        !previousInstance || previousInstance.resourceId !== resource?.id;

      if (!resource) {
        resource = {
          id: makeId("resource"),
          originalUrl: normalized.originalUrl,
          normalizedUrl: normalized.normalizedUrl,
          dedupeKey,
          title: tab.title?.trim() || normalized.domain,
          domain: normalized.domain,
          createdAt: now,
          updatedAt: now,
          lastVisitedAt: tab.lastAccessed ?? now,
          visitCount: 1,
          protected: false,
          notes: "",
        };
      } else {
        resource = {
          ...resource,
          originalUrl: normalized.originalUrl,
          normalizedUrl: normalized.normalizedUrl,
          title: tab.title?.trim() || resource.title,
          updatedAt: now,
          lastVisitedAt: Math.max(
            resource.lastVisitedAt,
            tab.lastAccessed ?? now,
          ),
          visitCount: resource.visitCount + (isNewVisit ? 1 : 0),
          trashedAt: undefined,
        };
      }

      await db.resources.put(resource);

      const instance: TabInstance = {
        browserTabId: tab.id!,
        resourceId: resource.id,
        windowId: tab.windowId,
        index: tab.index,
        pinned: tab.pinned,
        active: tab.active,
        discarded: tab.discarded,
        deepSleeping: false,
        audible: tab.audible ?? false,
        groupId: tab.groupId,
        lastAccessed: tab.lastAccessed ?? now,
        lastSeenAt: now,
      };
      await db.tabInstances.put(instance);

      const rules = (await db.rules.orderBy("priority").toArray()).filter(
        (rule) => rule.enabled,
      );
      const matchingRules = rules.filter(
        (rule) =>
          !resource!.blockedCollectionIds?.includes(rule.collectionId) &&
          matchesRule(resource!, rule),
      );
      const memberships: CollectionMembership[] = matchingRules.map((rule) => ({
        id: membershipId(rule.collectionId, resource!.id),
        collectionId: rule.collectionId,
        resourceId: resource!.id,
        source: "rule",
        ruleId: rule.id,
        createdAt: now,
      }));

      if (memberships.length > 0) {
        await db.memberships.bulkPut(memberships);
      }

      await db.events.add({
        type: eventType,
        resourceId: resource.id,
        browserTabId: tab.id,
        payload: {
          title: resource.title,
          windowId: tab.windowId,
          index: tab.index,
        },
        createdAt: now,
      });

      capturedResource = resource;
    },
  );

  if (notify) {
    await broadcastChange();
  }
  return capturedResource;
}

function queueTabCapture(tabId: number): void {
  const previous = captureQueue.get(tabId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        await captureTab(tab);
      } catch {
        // The tab may have closed before the queued capture started.
      }
    });

  captureQueue.set(tabId, next);
  void next.finally(() => {
    if (captureQueue.get(tabId) === next) {
      captureQueue.delete(tabId);
    }
  });
}

async function syncOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const liveIds = new Set<number>();

  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }
    liveIds.add(tab.id);
    await captureTab(tab, "TAB_CAPTURED", false);
  }

  const savedInstances = await db.tabInstances.toArray();
  const staleIds = savedInstances
    .filter((instance) => !liveIds.has(instance.browserTabId))
    .map((instance) => instance.browserTabId);

  if (staleIds.length > 0) {
    await db.tabInstances.bulkDelete(staleIds);
  }

  await broadcastChange();
}

async function removeTabInstance(tabId: number): Promise<void> {
  const instance = await db.tabInstances.get(tabId);
  if (!instance) {
    return;
  }

  await db.transaction("rw", db.tabInstances, db.events, async () => {
    await db.tabInstances.delete(tabId);
    await db.events.add({
      type: "TAB_CLOSED",
      resourceId: instance.resourceId,
      browserTabId: tabId,
      createdAt: Date.now(),
    });
  });
  await broadcastChange();
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const recovery = await db.deepSleepRecoveries
    .where("browserTabId")
    .equals(tabId)
    .first();
  if (recovery) {
    const pendingRemovalAt = Date.now();
    await db.deepSleepRecoveries.put({
      ...recovery,
      pendingRemovalAt,
    });
    setTimeout(() => {
      void db.deepSleepRecoveries.get(recovery.id).then((current) => {
        if (current?.pendingRemovalAt === pendingRemovalAt) {
          return db.deepSleepRecoveries.delete(recovery.id);
        }
        return undefined;
      });
    }, DEEP_SLEEP_CLOSE_CONFIRMATION_MS);
  }
  await removeTabInstance(tabId);
}

async function getTabGroups(): Promise<Map<number, chrome.tabGroups.TabGroup>> {
  try {
    const groups = await chrome.tabGroups.query({});
    return new Map(groups.map((group) => [group.id, group]));
  } catch {
    return new Map();
  }
}

async function createSnapshot(
  type: Snapshot["type"],
): Promise<Snapshot | null> {
  const tabs = await chrome.tabs.query({});
  const eligibleTabs = tabs.filter(
    (tab) =>
      tab.id !== undefined &&
      (normalizeUrl(tab.url ?? "") !== null ||
        isDeepSleepPageUrl(tab.url ?? "", SUSPENDED_PAGE_URL)),
  );

  for (const tab of eligibleTabs) {
    await captureTab(tab, "TAB_CAPTURED", false);
  }

  const [instances, resources, groups] = await Promise.all([
    db.tabInstances.toArray(),
    db.resources.toArray(),
    getTabGroups(),
  ]);
  const instanceByTabId = new Map(
    instances.map((instance) => [instance.browserTabId, instance]),
  );
  const resourceById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );

  const snapshotTabs = eligibleTabs
    .reduce<SnapshotTab[]>((result, tab) => {
      const instance = instanceByTabId.get(tab.id!);
      const resource = instance
        ? resourceById.get(instance.resourceId)
        : undefined;
      if (!instance || !resource) {
        return result;
      }

      const group = groups.get(tab.groupId);
      result.push({
        resourceId: resource.id,
        url: resource.originalUrl,
        title: resource.customTitle || resource.title,
        windowKey: String(tab.windowId),
        index: tab.index,
        pinned: tab.pinned,
        active: tab.active,
        groupKey: group ? `${tab.windowId}:${group.id}` : undefined,
        groupTitle: group?.title,
        groupColor: group?.color,
        groupCollapsed: group?.collapsed,
      });
      return result;
    }, [])
    .sort(
      (left, right) =>
        left.windowKey.localeCompare(right.windowKey) ||
        left.index - right.index,
    );

  const checksum = await createDedupeKey(JSON.stringify(snapshotTabs));
  const latest = await db.snapshots.orderBy("createdAt").reverse().first();
  if (type === "automatic" && latest?.checksum === checksum) {
    return null;
  }

  const snapshot: Snapshot = {
    id: makeId("snapshot"),
    type,
    createdAt: Date.now(),
    checksum,
    tabs: snapshotTabs,
  };

  await db.transaction("rw", db.snapshots, db.events, async () => {
    await db.snapshots.put(snapshot);
    await db.events.add({
      type: "SNAPSHOT_CREATED",
      payload: { snapshotId: snapshot.id, tabCount: snapshotTabs.length, type },
      createdAt: snapshot.createdAt,
    });

    const allSnapshots = await db.snapshots
      .orderBy("createdAt")
      .reverse()
      .toArray();
    if (allSnapshots.length > 100) {
      await db.snapshots.bulkDelete(
        allSnapshots.slice(100).map((item) => item.id),
      );
    }
  });

  await broadcastChange();
  return snapshot;
}

async function discardTab(
  tab: chrome.tabs.Tab & { id: number },
  respectProtection = false,
): Promise<boolean> {
  const resource = await captureTab(tab, "TAB_CAPTURED", false);
  if (!resource || (respectProtection && resource.protected)) {
    return false;
  }

  await appendEvent({
    type: "TAB_DISCARD_PREPARED",
    resourceId: resource.id,
    browserTabId: tab.id,
    createdAt: Date.now(),
  });

  const discarded = await chrome.tabs.discard(tab.id);
  if (discarded) {
    await db.tabInstances.update(tab.id, {
      discarded: true,
      deepSleeping: false,
      lastSeenAt: Date.now(),
    });
    await appendEvent({
      type: "TAB_DISCARDED",
      resourceId: resource.id,
      browserTabId: tab.id,
      createdAt: Date.now(),
    });
    return true;
  }
  return false;
}

async function discardResources(resourceIds: string[]): Promise<number> {
  const selected = new Set(resourceIds);
  const instances = await db.tabInstances
    .filter((instance) => selected.has(instance.resourceId))
    .toArray();
  let discardedCount = 0;

  for (const instance of instances) {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(instance.browserTabId);
    } catch {
      await db.tabInstances.delete(instance.browserTabId);
      continue;
    }
    try {
      if (
        isSafeToDiscard(tab, Number.POSITIVE_INFINITY, {
          respectAutoDiscardable: false,
        }) &&
        (await discardTab(tab, true))
      ) {
        discardedCount += 1;
      }
    } catch {
      // Keep the instance when persistence or discard fails.
    }
  }
  await broadcastChange();
  return discardedCount;
}

async function discardEligibleTabs(
  scope: Extract<
    VaultCommand,
    { type: "DISCARD_ELIGIBLE_TABS" }
  >["scope"],
  windowId?: number,
): Promise<number> {
  if (scope === "window" && windowId === undefined) {
    throw new Error(t("windowUnavailable"));
  }
  const tabs = await chrome.tabs.query(
    scope === "window" ? { windowId } : {},
  );
  let discardedCount = 0;

  for (const tab of tabs) {
    if (
      !isSafeToDiscard(tab, Number.POSITIVE_INFINITY, {
        respectAutoDiscardable: scope !== "force-all",
      })
    ) {
      continue;
    }
    try {
      if (await discardTab(tab, true)) {
        discardedCount += 1;
      }
    } catch {
      // One unavailable tab must not stop the remaining batch.
    }
  }

  await broadcastChange();
  return discardedCount;
}

async function deepSleepTab(
  tab: chrome.tabs.Tab & { id: number },
  group?: chrome.tabGroups.TabGroup,
): Promise<boolean> {
  const resource = await captureTab(tab, "TAB_CAPTURED", false);
  if (!resource || resource.protected) {
    return false;
  }

  const placeholderUrl = createDeepSleepUrl(SUSPENDED_PAGE_URL, {
    version: 1,
    resourceId: resource.id,
    url: resource.originalUrl,
    title: resource.customTitle || resource.title,
  });
  const recovery: DeepSleepRecovery = {
    id: `${resource.id}:${tab.id}`,
    browserTabId: tab.id,
    resourceId: resource.id,
    originalUrl: resource.originalUrl,
    title: resource.customTitle || resource.title,
    windowId: tab.windowId,
    index: tab.index,
    pinned: tab.pinned,
    groupId: tab.groupId,
    groupKey: group ? `${tab.windowId}:${group.id}` : undefined,
    groupTitle: group?.title,
    groupColor: group?.color,
    groupCollapsed: group?.collapsed,
    createdAt: Date.now(),
    pendingRemovalAt: undefined,
  };
  await db.transaction(
    "rw",
    db.deepSleepRecoveries,
    db.events,
    async () => {
      await db.deepSleepRecoveries.put(recovery);
      await db.events.add({
        type: "TAB_DEEP_SLEEP_PREPARED",
        resourceId: resource.id,
        browserTabId: tab.id,
        payload: { originalUrl: resource.originalUrl },
        createdAt: recovery.createdAt,
      });
    },
  );

  try {
    await chrome.tabs.update(tab.id, { url: placeholderUrl });
  } catch (error) {
    await db.deepSleepRecoveries.delete(recovery.id);
    throw error;
  }
  await db.tabInstances.update(tab.id, {
    discarded: false,
    deepSleeping: true,
    lastSeenAt: Date.now(),
  });
  await appendEvent({
    type: "TAB_DEEP_SLEEP_COMMITTED",
    resourceId: resource.id,
    browserTabId: tab.id,
    createdAt: Date.now(),
  });
  return true;
}

async function deepSleepEligibleTabs(): Promise<number> {
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({}),
    getTabGroups(),
  ]);
  let deepSleepingCount = 0;

  for (const tab of tabs) {
    if (!isEligibleForDeepSleep(tab)) {
      continue;
    }
    try {
      if (await deepSleepTab(tab, groups.get(tab.groupId))) {
        deepSleepingCount += 1;
      }
    } catch {
      // One unavailable tab must not stop the remaining batch.
    }
  }

  await broadcastChange();
  return deepSleepingCount;
}

async function archiveResources(resourceIds: string[]): Promise<void> {
  const selected = new Set(resourceIds);
  const instances = await db.tabInstances
    .filter((instance) => selected.has(instance.resourceId))
    .toArray();

  for (const instance of instances) {
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(instance.browserTabId);
    } catch {
      await db.tabInstances.delete(instance.browserTabId);
      continue;
    }
    await captureTab(tab, "TAB_CAPTURED", false);
  }

  const liveInstances = await db.tabInstances
    .filter((instance) => selected.has(instance.resourceId))
    .toArray();

  await db.transaction("rw", db.events, async () => {
    await db.events.bulkAdd(
      liveInstances.map((instance) => ({
        type: "ARCHIVE_PREPARED" as const,
        resourceId: instance.resourceId,
        browserTabId: instance.browserTabId,
        createdAt: Date.now(),
      })),
    );
  });

  for (const instance of liveInstances) {
    try {
      await db.deepSleepRecoveries
        .where("browserTabId")
        .equals(instance.browserTabId)
        .delete();
      await chrome.tabs.remove(instance.browserTabId);
      await appendEvent({
        type: "ARCHIVE_COMMITTED",
        resourceId: instance.resourceId,
        browserTabId: instance.browserTabId,
        createdAt: Date.now(),
      });
    } catch {
      // Keep the saved instance; the next sync will reconcile it.
    }
  }

  await syncOpenTabs();
}

async function deleteResources(resourceIds: string[]): Promise<number> {
  const requestedIds = [...new Set(resourceIds)];
  const [resources, instances, snapshots] = await Promise.all([
    db.resources.bulkGet(requestedIds),
    db.tabInstances.toArray(),
    db.snapshots.toArray(),
  ]);
  const openResourceIds = new Set(
    instances.map((instance) => instance.resourceId),
  );
  const deletableIds = resources
    .filter(
      (resource): resource is Resource =>
        Boolean(resource && !openResourceIds.has(resource.id)),
    )
    .map((resource) => resource.id);
  if (deletableIds.length === 0) {
    return 0;
  }

  const deleting = new Set(deletableIds);
  const snapshotUpdates = await Promise.all(
    snapshots.map(async (snapshot) => {
      const tabs = snapshot.tabs.filter(
        (tab) => !deleting.has(tab.resourceId),
      );
      if (tabs.length === snapshot.tabs.length) {
        return null;
      }
      return {
        ...snapshot,
        tabs,
        checksum: await createDedupeKey(JSON.stringify(tabs)),
      };
    }),
  );

  await db.transaction(
    "rw",
    db.resources,
    db.memberships,
    db.events,
    db.snapshots,
    db.deepSleepRecoveries,
    async () => {
      await db.resources.bulkDelete(deletableIds);
      await db.memberships
        .where("resourceId")
        .anyOf(deletableIds)
        .delete();
      await db.events.where("resourceId").anyOf(deletableIds).delete();
      await db.deepSleepRecoveries
        .where("resourceId")
        .anyOf(deletableIds)
        .delete();
      for (const snapshot of snapshotUpdates) {
        if (snapshot) {
          if (snapshot.tabs.length === 0) {
            await db.snapshots.delete(snapshot.id);
          } else {
            await db.snapshots.put(snapshot);
          }
        }
      }
    },
  );

  await rebuildContextMenus();
  await broadcastChange();
  return deletableIds.length;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function restoreResources(resourceIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(resourceIds)];
  const [resources, instances, settings] = await Promise.all([
    db.resources.bulkGet(uniqueIds),
    db.tabInstances.toArray(),
    ensureDatabaseDefaults(),
  ]);
  const openResourceIds = new Set(
    instances.map((instance) => instance.resourceId),
  );
  const toOpen = resources.filter(
    (resource): resource is Resource =>
      Boolean(resource && !openResourceIds.has(resource.id)),
  );

  let isFirst = true;
  for (const chunk of chunkItems(toOpen, settings.restoreConcurrency)) {
    await Promise.all(
      chunk.map(async (resource) => {
        const shouldActivate = isFirst;
        isFirst = false;
        const tab = await chrome.tabs.create({
          url: resource.originalUrl,
          active: shouldActivate,
        });
        await captureTab(tab, "RESOURCE_RESTORED", false);
      }),
    );
  }
  await broadcastChange();
}

async function restoreDeepSleepingTab(
  tabId: number,
  activate = false,
): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  const rawUrl = tab.url ?? tab.pendingUrl ?? "";
  const isPlaceholder = isDeepSleepPageUrl(rawUrl, SUSPENDED_PAGE_URL);
  if (isPlaceholder) {
    await captureDeepSleepingTab(
      tab as chrome.tabs.Tab & { id: number },
      rawUrl,
    );
  }

  const instance = await db.tabInstances.get(tabId);
  if (!isPlaceholder && !instance?.deepSleeping) {
    return false;
  }

  const resource = instance
    ? await db.resources.get(instance.resourceId)
    : undefined;
  const payload = parseDeepSleepPayload(rawUrl, SUSPENDED_PAGE_URL);
  const recovery = await db.deepSleepRecoveries
    .where("browserTabId")
    .equals(tabId)
    .first();
  const targetUrl =
    resource?.originalUrl ?? recovery?.originalUrl ?? payload?.url;
  if (!targetUrl || normalizeUrl(targetUrl) === null) {
    return false;
  }

  if (recovery) {
    await db.deepSleepRecoveries.delete(recovery.id);
  }
  try {
    await chrome.tabs.update(tabId, { url: targetUrl, active: activate });
  } catch (error) {
    if (recovery) {
      await db.deepSleepRecoveries.put(recovery);
    }
    throw error;
  }
  if (instance) {
    await db.tabInstances.update(tabId, {
      deepSleeping: false,
      discarded: false,
      lastSeenAt: Date.now(),
    });
  }
  await appendEvent({
    type: "TAB_DEEP_SLEEP_RESTORED",
    resourceId: resource?.id ?? payload?.resourceId,
    browserTabId: tabId,
    createdAt: Date.now(),
  });
  await broadcastChange();
  return true;
}

async function rebuildMissingDeepSleepingTabs(): Promise<void> {
  const recoveries = await db.deepSleepRecoveries.toArray();
  if (recoveries.length === 0) {
    return;
  }

  const tabs = await chrome.tabs.query({});
  const deepSleepingTabs = new Map<string, chrome.tabs.Tab[]>();
  const resolvedTabs: Array<{
    tab: chrome.tabs.Tab & { id: number };
    recovery: DeepSleepRecovery;
  }> = [];
  for (const tab of tabs) {
    const payload = parseDeepSleepPayload(
      tab.url ?? tab.pendingUrl ?? "",
      SUSPENDED_PAGE_URL,
    );
    if (payload) {
      const matchingTabs = deepSleepingTabs.get(payload.resourceId) ?? [];
      matchingTabs.push(tab);
      deepSleepingTabs.set(payload.resourceId, matchingTabs);
    }
  }

  for (const recovery of recoveries) {
    const matchingTabs = deepSleepingTabs.get(recovery.resourceId) ?? [];
    const existingIndex = Math.max(
      0,
      matchingTabs.findIndex((tab) => tab.id === recovery.browserTabId),
    );
    const [existing] = matchingTabs.splice(existingIndex, 1);
    if (existing?.id !== undefined) {
      await db.deepSleepRecoveries.put({
        ...recovery,
        browserTabId: existing.id,
        windowId: existing.windowId,
        index: existing.index,
        pendingRemovalAt: undefined,
      });
      await captureDeepSleepingTab(
        existing as chrome.tabs.Tab & { id: number },
        existing.url ?? existing.pendingUrl ?? "",
      );
      resolvedTabs.push({
        tab: existing as chrome.tabs.Tab & { id: number },
        recovery,
      });
      continue;
    }

    const placeholderUrl = createDeepSleepUrl(SUSPENDED_PAGE_URL, {
      version: 1,
      resourceId: recovery.resourceId,
      url: recovery.originalUrl,
      title: recovery.title,
    });
    let created: chrome.tabs.Tab;
    try {
      created = await chrome.tabs.create({
        windowId: recovery.windowId,
        url: placeholderUrl,
        active: false,
        pinned: recovery.pinned,
        index: recovery.index,
      });
    } catch {
      created = await chrome.tabs.create({
        url: placeholderUrl,
        active: false,
        pinned: recovery.pinned,
      });
    }
    if (created.id === undefined) {
      continue;
    }

    await db.deepSleepRecoveries.put({
      ...recovery,
      browserTabId: created.id,
      windowId: created.windowId,
      index: created.index,
      pendingRemovalAt: undefined,
    });
    await captureDeepSleepingTab(
      created as chrome.tabs.Tab & { id: number },
      placeholderUrl,
    );
    resolvedTabs.push({
      tab: created as chrome.tabs.Tab & { id: number },
      recovery,
    });
  }

  const newGroups = new Map<
    string,
    Array<{
      tab: chrome.tabs.Tab & { id: number };
      recovery: DeepSleepRecovery;
    }>
  >();
  for (const entry of resolvedTabs) {
    const { recovery, tab } = entry;
    if (recovery.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        const existingGroup = await chrome.tabGroups.get(recovery.groupId);
        if (existingGroup.windowId === tab.windowId) {
          await chrome.tabs.group({
            groupId: recovery.groupId,
            tabIds: [tab.id],
          });
          continue;
        }
      } catch {
        // The original group disappears when its final tab is removed.
      }
    }

    if (!recovery.groupKey) {
      continue;
    }
    const restoreKey = `${tab.windowId}:${recovery.groupKey}`;
    const entries = newGroups.get(restoreKey) ?? [];
    entries.push(entry);
    newGroups.set(restoreKey, entries);
  }

  for (const entries of newGroups.values()) {
    const [sample] = entries;
    const groupId = await chrome.tabs.group({
      tabIds: entries.map((entry) => entry.tab.id) as [
        number,
        ...number[],
      ],
      createProperties: { windowId: sample.tab.windowId },
    });
    await chrome.tabGroups.update(groupId, {
      title: sample.recovery.groupTitle,
      color: sample.recovery.groupColor,
      collapsed: sample.recovery.groupCollapsed,
    });
  }
}

async function migrateLegacyDeepSleepRecoveries(): Promise<void> {
  const settings = await ensureDatabaseDefaults();
  if (settings.deepSleepLegacyRecoveryVersion >= 2) {
    return;
  }

  const [events, instances, resources, snapshots, savedRecoveries] =
    await Promise.all([
      db.events.orderBy("createdAt").toArray(),
      db.tabInstances.toArray(),
      db.resources.toArray(),
      db.snapshots.orderBy("createdAt").reverse().toArray(),
      db.deepSleepRecoveries.toArray(),
    ]);
  const latestDeepSleepState = new Map<
    number,
    { resourceId: string; sleeping: boolean; createdAt: number }
  >();
  for (const event of events) {
    if (
      event.browserTabId === undefined ||
      event.resourceId === undefined ||
      ![
        "TAB_DEEP_SLEEP_COMMITTED",
        "TAB_DEEP_SLEEP_RESTORED",
        "ARCHIVE_COMMITTED",
      ].includes(event.type)
    ) {
      continue;
    }
    latestDeepSleepState.set(event.browserTabId, {
      resourceId: event.resourceId,
      sleeping: event.type === "TAB_DEEP_SLEEP_COMMITTED",
      createdAt: event.createdAt,
    });
  }

  const instanceByTabId = new Map(
    instances.map((instance) => [instance.browserTabId, instance]),
  );
  const resourceById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );
  const savedRecoveryById = new Map(
    savedRecoveries.map((recovery) => [recovery.id, recovery]),
  );
  const recoveries: DeepSleepRecovery[] = [];
  for (const [browserTabId, state] of latestDeepSleepState) {
    if (!state.sleeping) {
      continue;
    }
    const resource = resourceById.get(state.resourceId);
    if (!resource) {
      continue;
    }
    const instance = instanceByTabId.get(browserTabId);
    const id = `${resource.id}:${browserTabId}`;
    const savedRecovery = savedRecoveryById.get(id);
    const snapshotTabs = snapshots
      .flatMap((snapshot) => snapshot.tabs)
      .filter((tab) => tab.resourceId === resource.id);
    const snapshotTab =
      snapshotTabs.find((tab) => tab.groupKey !== undefined) ??
      snapshotTabs[0];
    const snapshotWindowId = Number(snapshotTab?.windowKey);
    recoveries.push({
      ...savedRecovery,
      id,
      browserTabId: savedRecovery?.browserTabId ?? browserTabId,
      resourceId: resource.id,
      originalUrl: resource.originalUrl,
      title: resource.customTitle || resource.title,
      windowId:
        savedRecovery?.windowId ??
        instance?.windowId ??
        (Number.isFinite(snapshotWindowId)
          ? snapshotWindowId
          : chrome.windows.WINDOW_ID_NONE),
      index: savedRecovery?.index ?? instance?.index ?? snapshotTab?.index ?? 0,
      pinned:
        savedRecovery?.pinned ?? instance?.pinned ?? snapshotTab?.pinned ?? false,
      groupId:
        savedRecovery?.groupId ??
        instance?.groupId ??
        chrome.tabGroups.TAB_GROUP_ID_NONE,
      groupKey: savedRecovery?.groupKey ?? snapshotTab?.groupKey,
      groupTitle: savedRecovery?.groupTitle ?? snapshotTab?.groupTitle,
      groupColor: savedRecovery?.groupColor ?? snapshotTab?.groupColor,
      groupCollapsed:
        savedRecovery?.groupCollapsed ?? snapshotTab?.groupCollapsed,
      createdAt: state.createdAt,
      pendingRemovalAt: undefined,
    });
  }

  await db.transaction(
    "rw",
    db.deepSleepRecoveries,
    db.settings,
    async () => {
      if (recoveries.length > 0) {
        await db.deepSleepRecoveries.bulkPut(recoveries);
      }
      await db.settings.put({
        ...settings,
        deepSleepLegacyRecoveryVersion: 2,
      });
    },
  );
}

async function focusResource(resourceId: string): Promise<void> {
  const instance = await db.tabInstances
    .where("resourceId")
    .equals(resourceId)
    .first();
  if (!instance) {
    await restoreResources([resourceId]);
    return;
  }

  try {
    await chrome.windows.update(instance.windowId, { focused: true });
    if (instance.deepSleeping) {
      await restoreDeepSleepingTab(instance.browserTabId, true);
    } else {
      await chrome.tabs.update(instance.browserTabId, { active: true });
    }
  } catch {
    await db.tabInstances.delete(instance.browserTabId);
    await restoreResources([resourceId]);
  }
}

async function restoreSnapshot(snapshotId: string): Promise<void> {
  const [snapshot, settings] = await Promise.all([
    db.snapshots.get(snapshotId),
    ensureDatabaseDefaults(),
  ]);
  if (!snapshot || snapshot.tabs.length === 0) {
    return;
  }

  const windowGroups = new Map<string, SnapshotTab[]>();
  for (const tab of snapshot.tabs) {
    const group = windowGroups.get(tab.windowKey) ?? [];
    group.push(tab);
    windowGroups.set(tab.windowKey, group);
  }

  for (const tabs of windowGroups.values()) {
    tabs.sort((left, right) => left.index - right.index);
    const first = tabs[0];
    const restoredWindow = await chrome.windows.create({
      url: first.url,
      focused: first.active,
    });
    if (!restoredWindow?.id) {
      continue;
    }
    const firstTab = restoredWindow.tabs?.[0];
    const created = new Map<number, SnapshotTab>();

    if (firstTab?.id !== undefined) {
      await chrome.tabs.update(firstTab.id, { pinned: first.pinned });
      created.set(firstTab.id, first);
    }

    for (const chunk of chunkItems(
      tabs.slice(1),
      settings.restoreConcurrency,
    )) {
      const createdTabs = await Promise.all(
        chunk.map((tab) =>
          chrome.tabs.create({
            windowId: restoredWindow.id,
            url: tab.url,
            active: false,
            pinned: tab.pinned,
            index: tab.index,
          }),
        ),
      );
      createdTabs.forEach((tab, index) => {
        if (tab.id !== undefined) {
          created.set(tab.id, chunk[index]);
        }
      });
    }

    const groupedTabIds = new Map<string, number[]>();
    for (const [tabId, tab] of created) {
      if (!tab.groupKey) {
        continue;
      }
      const ids = groupedTabIds.get(tab.groupKey) ?? [];
      ids.push(tabId);
      groupedTabIds.set(tab.groupKey, ids);
    }

    for (const [groupKey, tabIds] of groupedTabIds) {
      if (tabIds.length === 0) {
        continue;
      }
      const sample = [...created.values()].find(
        (tab) => tab.groupKey === groupKey,
      );
      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
        createProperties: { windowId: restoredWindow.id },
      });
      await chrome.tabGroups.update(groupId, {
        title: sample?.groupTitle,
        color: sample?.groupColor,
        collapsed: sample?.groupCollapsed,
      });
    }

    const activeEntry = [...created.entries()].find(([, tab]) => tab.active);
    if (activeEntry) {
      await chrome.tabs.update(activeEntry[0], { active: true });
    }
  }

  await syncOpenTabs();
}

async function createCollection(
  name: string,
  color: Collection["color"],
): Promise<Collection> {
  const existingCollections = await db.collections.toArray();
  const highestSortOrder = existingCollections.reduce(
    (highest, collection) =>
      Math.max(highest, collection.sortOrder ?? -1),
    -1,
  );
  const collection: Collection = {
    id: makeId("collection"),
    name: name.trim(),
    color,
    createdAt: Date.now(),
    sortOrder: highestSortOrder + 1,
    autoArchiveMinutes: null,
  };
  await db.collections.put(collection);
  await rebuildContextMenus();
  await broadcastChange();
  return collection;
}

async function updateCollection(
  collectionId: string,
  name: string,
  color: Collection["color"],
): Promise<Collection> {
  const collection = await db.collections.get(collectionId);
  if (!collection) {
    throw new Error(t("groupMissing"));
  }
  const updated: Collection = {
    ...collection,
    name: name.trim(),
    color,
  };
  await db.collections.put(updated);
  await rebuildContextMenus();
  await broadcastChange();
  return updated;
}

async function deleteCollection(collectionId: string): Promise<void> {
  await db.transaction(
    "rw",
    db.resources,
    db.collections,
    db.memberships,
    db.rules,
    async () => {
      await db.collections.delete(collectionId);
      await db.memberships
        .where("collectionId")
        .equals(collectionId)
        .delete();
      await db.rules.where("collectionId").equals(collectionId).delete();
      const blockedResources = await db.resources
        .filter((resource) =>
          Boolean(resource.blockedCollectionIds?.includes(collectionId)),
        )
        .toArray();
      for (const resource of blockedResources) {
        await db.resources.update(resource.id, {
          blockedCollectionIds: resource.blockedCollectionIds?.filter(
            (id) => id !== collectionId,
          ),
          updatedAt: Date.now(),
        });
      }
    },
  );
  await rebuildContextMenus();
  await broadcastChange();
}

async function addToCollection(
  collectionId: string,
  resourceIds: string[],
): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.resources, db.memberships, async () => {
    await db.memberships.bulkPut(
      resourceIds.map((resourceId) => ({
        id: membershipId(collectionId, resourceId),
        collectionId,
        resourceId,
        source: "manual" as const,
        createdAt: now,
      })),
    );
    for (const resourceId of resourceIds) {
      const resource = await db.resources.get(resourceId);
      if (resource?.blockedCollectionIds?.includes(collectionId)) {
        await db.resources.update(resourceId, {
          blockedCollectionIds: resource.blockedCollectionIds.filter(
            (id) => id !== collectionId,
          ),
          updatedAt: now,
        });
      }
    }
  });
  await rebuildContextMenus();
  await broadcastChange();
}

async function removeFromCollection(
  collectionId: string,
  resourceIds: string[],
): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.resources, db.memberships, async () => {
    await db.memberships.bulkDelete(
      resourceIds.map((resourceId) => membershipId(collectionId, resourceId)),
    );
    for (const resourceId of resourceIds) {
      const resource = await db.resources.get(resourceId);
      if (!resource) {
        continue;
      }
      await db.resources.update(resourceId, {
        blockedCollectionIds: [
          ...new Set([...(resource.blockedCollectionIds ?? []), collectionId]),
        ],
        updatedAt: now,
      });
    }
  });
  await rebuildContextMenus();
  await broadcastChange();
}

async function reorderCollections(collectionIds: string[]): Promise<void> {
  await db.transaction("rw", db.collections, async () => {
    for (const [sortOrder, collectionId] of collectionIds.entries()) {
      await db.collections.update(collectionId, { sortOrder });
    }
  });
  await rebuildContextMenus();
  await broadcastChange();
}

async function moveResourceCollection(
  resourceId: string,
  sourceCollectionId: string,
  targetCollectionId?: string,
): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.resources, db.memberships, async () => {
    const resource = await db.resources.get(resourceId);
    if (!resource) {
      throw new Error(t("resourceMissing"));
    }

    await db.memberships.delete(
      membershipId(sourceCollectionId, resourceId),
    );

    const blockedCollectionIds = new Set(
      resource.blockedCollectionIds ?? [],
    );
    blockedCollectionIds.add(sourceCollectionId);

    if (targetCollectionId) {
      blockedCollectionIds.delete(targetCollectionId);
      await db.memberships.put({
        id: membershipId(targetCollectionId, resourceId),
        collectionId: targetCollectionId,
        resourceId,
        source: "manual",
        createdAt: now,
      });
    }

    await db.resources.update(resourceId, {
      blockedCollectionIds: [...blockedCollectionIds],
      updatedAt: now,
    });
  });
  await rebuildContextMenus();
  await broadcastChange();
}

async function createRule(
  input: Extract<VaultCommand, { type: "CREATE_RULE" }>["rule"],
): Promise<Rule> {
  const now = Date.now();
  const rule: Rule = {
    ...input,
    id: makeId("rule"),
    enabled: true,
    priority: now,
    excludedDomains: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.rules.put(rule);
  await rescanRules();
  return rule;
}

async function rescanRules(): Promise<void> {
  const [resources, rules] = await Promise.all([
    db.resources.toArray(),
    db.rules
      .orderBy("priority")
      .toArray()
      .then((items) => items.filter((rule) => rule.enabled)),
  ]);
  const now = Date.now();
  const memberships: CollectionMembership[] = [];

  for (const resource of resources) {
    for (const rule of rules) {
      if (
        !resource.blockedCollectionIds?.includes(rule.collectionId) &&
        matchesRule(resource, rule)
      ) {
        memberships.push({
          id: membershipId(rule.collectionId, resource.id),
          collectionId: rule.collectionId,
          resourceId: resource.id,
          source: "rule",
          ruleId: rule.id,
          createdAt: now,
        });
      }
    }
  }

  if (memberships.length > 0) {
    await db.memberships.bulkPut(memberships);
  }
  await broadcastChange();
}

async function updateSettings(
  patch: Partial<VaultSettings>,
): Promise<VaultSettings> {
  const existing = await ensureDatabaseDefaults();
  const settings = normalizeSettings({
    ...existing,
    ...patch,
  });
  await db.settings.put(settings);
  await scheduleMaintenance(settings);
  if (patch.collectionSort !== undefined) {
    await rebuildContextMenus();
  }
  await broadcastChange();
  return settings;
}

async function updateResourceTitle(
  resourceId: string,
  customTitle: string,
): Promise<void> {
  const resource = await db.resources.get(resourceId);
  if (!resource) {
    throw new Error(t("resourceMissing"));
  }
  const normalizedTitle = customTitle.trim();
  await db.transaction("rw", db.resources, db.events, async () => {
    await db.resources.update(resourceId, {
      customTitle: normalizedTitle || undefined,
      updatedAt: Date.now(),
    });
    await db.events.add({
      type: "RESOURCE_RENAMED",
      resourceId,
      payload: {
        customTitle: normalizedTitle,
        originalTitle: resource.title,
      },
      createdAt: Date.now(),
    });
  });
  await broadcastChange();
}

async function importData(data: VaultExport): Promise<void> {
  const validated = parseVaultExport(data);
  const normalizedResources = await Promise.all(
    validated.resources.map(async (resource) => {
      const normalized = normalizeUrl(resource.originalUrl);
      if (!normalized) {
        throw new Error(t("invalidBackup"));
      }
      return {
        ...resource,
        originalUrl: normalized.originalUrl,
        normalizedUrl: normalized.normalizedUrl,
        domain: normalized.domain,
        dedupeKey: await createDedupeKey(normalized.normalizedUrl),
      };
    }),
  );
  const importedSettings = normalizeSettings({
    ...(await ensureDatabaseDefaults()),
    ...validated.settings,
  });

  await db.transaction(
    "rw",
    [
      db.resources,
      db.collections,
      db.memberships,
      db.rules,
      db.snapshots,
      db.settings,
      db.events,
    ],
    async () => {
      const resourceIdMap = new Map<string, string>();

      for (const resource of normalizedResources) {
        const existing = await db.resources
          .where("dedupeKey")
          .equals(resource.dedupeKey)
          .first();
        if (existing) {
          resourceIdMap.set(resource.id, existing.id);
          await db.resources.put({
            ...existing,
            title: resource.title || existing.title,
            customTitle: existing.customTitle || resource.customTitle,
            notes: resource.notes || existing.notes,
            protected: existing.protected || resource.protected,
            blockedCollectionIds: [
              ...new Set([
                ...(existing.blockedCollectionIds ?? []),
                ...(resource.blockedCollectionIds ?? []),
              ]),
            ],
            lastVisitedAt: Math.max(
              existing.lastVisitedAt,
              resource.lastVisitedAt,
            ),
            visitCount: Math.max(existing.visitCount, resource.visitCount),
            updatedAt: Date.now(),
          });
        } else {
          const targetId = (await db.resources.get(resource.id))
            ? makeId("resource")
            : resource.id;
          resourceIdMap.set(resource.id, targetId);
          await db.resources.put({ ...resource, id: targetId });
        }
      }

      await db.collections.bulkPut(validated.collections);
      await db.rules.bulkPut(validated.rules);

      const importedMemberships = validated.memberships.map((membership) => {
        const resourceId =
          resourceIdMap.get(membership.resourceId) ?? membership.resourceId;
        return {
          ...membership,
          id: membershipId(membership.collectionId, resourceId),
          resourceId,
          source: "import" as const,
        };
      });
      await db.memberships.bulkPut(importedMemberships);

      const importedSnapshots = validated.snapshots.map((snapshot) => ({
        ...snapshot,
        tabs: snapshot.tabs.map((tab) => ({
          ...tab,
          resourceId: resourceIdMap.get(tab.resourceId) ?? tab.resourceId,
        })),
      }));
      await db.snapshots.bulkPut(importedSnapshots);
      await db.settings.put(importedSettings);
      await db.events.add({
        type: "IMPORT_COMPLETED",
        payload: { resourceCount: validated.resources.length },
        createdAt: Date.now(),
      });
    },
  );

  await scheduleMaintenance(importedSettings);
  await rebuildContextMenus();
  await broadcastChange();
}

async function runMaintenance(): Promise<void> {
  const settings = await ensureDatabaseDefaults();
  if (settings.autoDiscardEnabled) {
    const cutoff = Date.now() - settings.autoDiscardMinutes * 60_000;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (isSafeToDiscard(tab, cutoff)) {
        try {
          await discardTab(tab, true);
        } catch {
          // One protected or unavailable tab must not stop maintenance.
        }
      }
    }
  }

  await createSnapshot("automatic");
  const eventCutoff =
    Date.now() - settings.recentClosedRetentionDays * 24 * 60 * 60_000;
  await db.events.where("createdAt").below(eventCutoff).delete();
  await broadcastChange();
}

async function scheduleMaintenance(
  settings?: VaultSettings,
): Promise<void> {
  const effectiveSettings = settings ?? (await ensureDatabaseDefaults());
  await chrome.alarms.clear(MAINTENANCE_ALARM);
  chrome.alarms.create(MAINTENANCE_ALARM, {
    periodInMinutes: Math.max(1, effectiveSettings.snapshotIntervalMinutes),
  });
}

async function bootstrap(): Promise<void> {
  await ensureDatabaseDefaults();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Side panel behavior may already be configured by the browser.
  }
  await scheduleMaintenance();
  await rebuildContextMenus();
  await migrateLegacyDeepSleepRecoveries();
  await rebuildMissingDeepSleepingTabs();
  await syncOpenTabs();
  await createSnapshot("automatic");
}

function ensureBootstrapped(): Promise<void> {
  bootstrapPromise ??= bootstrap().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

async function handleCommand(
  command: VaultCommand,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  await ensureBootstrapped();

  switch (command.type) {
    case "GET_STATE":
      return getVaultState();
    case "REFRESH_TABS":
      await migrateLegacyDeepSleepRecoveries();
      await rebuildMissingDeepSleepingTabs();
      await syncOpenTabs();
      return getVaultState();
    case "DISCARD_RESOURCES":
      return discardResources(command.resourceIds);
    case "DISCARD_ELIGIBLE_TABS":
      return discardEligibleTabs(command.scope, command.windowId);
    case "DEEP_SLEEP_ELIGIBLE_TABS":
      return deepSleepEligibleTabs();
    case "RESTORE_DEEP_SLEEP_TAB":
      if (sender?.tab?.id === undefined) {
        throw new Error(t("deepSleepTabUnavailable"));
      }
      return restoreDeepSleepingTab(sender.tab.id);
    case "ARCHIVE_RESOURCES":
      await archiveResources(command.resourceIds);
      return undefined;
    case "DELETE_RESOURCES":
      return deleteResources(command.resourceIds);
    case "RESTORE_RESOURCES":
      await restoreResources(command.resourceIds);
      return undefined;
    case "FOCUS_RESOURCE":
      await focusResource(command.resourceId);
      return undefined;
    case "CREATE_SNAPSHOT":
      return createSnapshot("manual");
    case "RESTORE_SNAPSHOT":
      await restoreSnapshot(command.snapshotId);
      return undefined;
    case "CREATE_COLLECTION":
      return createCollection(command.name, command.color);
    case "UPDATE_COLLECTION":
      return updateCollection(
        command.collectionId,
        command.name,
        command.color,
      );
    case "DELETE_COLLECTION":
      await deleteCollection(command.collectionId);
      return undefined;
    case "ADD_TO_COLLECTION":
      await addToCollection(command.collectionId, command.resourceIds);
      return undefined;
    case "REMOVE_FROM_COLLECTION":
      await removeFromCollection(
        command.collectionId,
        command.resourceIds,
      );
      return undefined;
    case "REORDER_COLLECTIONS":
      await reorderCollections(command.collectionIds);
      return undefined;
    case "MOVE_RESOURCE_COLLECTION":
      await moveResourceCollection(
        command.resourceId,
        command.sourceCollectionId,
        command.targetCollectionId,
      );
      return undefined;
    case "CREATE_RULE":
      return createRule(command.rule);
    case "DELETE_RULE":
      await db.rules.delete(command.ruleId);
      await broadcastChange();
      return undefined;
    case "RESCAN_RULES":
      await rescanRules();
      return undefined;
    case "UPDATE_SETTINGS":
      return updateSettings(command.settings);
    case "UPDATE_RESOURCE_TITLE":
      await updateResourceTitle(command.resourceId, command.customTitle);
      return undefined;
    case "TOGGLE_PROTECTED": {
      const resource = await db.resources.get(command.resourceId);
      if (resource) {
        await db.resources.update(resource.id, {
          protected: !resource.protected,
          updatedAt: Date.now(),
        });
      }
      await broadcastChange();
      return undefined;
    }
    case "IMPORT_DATA":
      await importData(command.data);
      return undefined;
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: VaultCommand,
    sender,
    sendResponse: (response: VaultResponse<unknown>) => void,
  ) => {
    void handleCommand(message, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : t("unknownError"),
        }),
      );
    return true;
  },
);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    const menuItemId = String(info.menuItemId);
    if (menuItemId === CONTEXT_MENU_OPEN) {
      await openSidePanel(tab);
      return;
    }
    if (!menuItemId.startsWith(CONTEXT_MENU_COLLECTION_PREFIX) || !tab) {
      return;
    }

    const collectionId = menuItemId.slice(
      CONTEXT_MENU_COLLECTION_PREFIX.length,
    );
    const resource = await captureTab(tab, "TAB_CAPTURED", false);
    if (!resource) {
      return;
    }
    await addToCollection(collectionId, [resource.id]);
  })().catch(() => undefined);
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined) {
    queueTabCapture(tab.id);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    changeInfo.url !== undefined ||
    changeInfo.title !== undefined ||
    changeInfo.status === "complete" ||
    changeInfo.discarded !== undefined ||
    changeInfo.pinned !== undefined
  ) {
    queueTabCapture(tabId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    try {
      await ensureBootstrapped();
      const [instance, tab] = await Promise.all([
        db.tabInstances.get(tabId),
        chrome.tabs.get(tabId),
      ]);
      if (
        instance?.deepSleeping ||
        isDeepSleepPageUrl(
          tab.url ?? tab.pendingUrl ?? "",
          SUSPENDED_PAGE_URL,
        )
      ) {
        await restoreDeepSleepingTab(tabId);
        return;
      }
    } catch {
      // The tab may have closed or navigated while activation was handled.
    }
    queueTabCapture(tabId);
  })();
});

chrome.tabs.onMoved.addListener((tabId) => {
  queueTabCapture(tabId);
});

chrome.tabs.onAttached.addListener((tabId) => {
  queueTabCapture(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void handleTabRemoved(removedTabId);
  queueTabCapture(addedTabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleTabRemoved(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) {
    void runMaintenance();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureBootstrapped();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureBootstrapped();
});

void ensureBootstrapped();
