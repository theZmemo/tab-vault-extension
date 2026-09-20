import {
  appendEvent,
  db,
  ensureDatabaseDefaults,
  getVaultState,
  makeId,
  membershipId,
} from "../shared/db";
import { sortCollections } from "../shared/collections";
import { t } from "../shared/i18n";
import { matchesRule } from "../shared/rules";
import type {
  Collection,
  CollectionMembership,
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

async function captureTab(
  tab: chrome.tabs.Tab,
  eventType: "TAB_CAPTURED" | "RESOURCE_RESTORED" = "TAB_CAPTURED",
  notify = true,
): Promise<Resource | null> {
  if (tab.id === undefined) {
    return null;
  }

  const normalized = normalizeUrl(tab.url ?? tab.pendingUrl ?? "");
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
    (tab) => tab.id !== undefined && normalizeUrl(tab.url ?? "") !== null,
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

function isSafeToDiscard(
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

async function discardTab(
  tab: chrome.tabs.Tab & { id: number },
  respectProtection = false,
): Promise<void> {
  const resource = await captureTab(tab, "TAB_CAPTURED", false);
  if (!resource || (respectProtection && resource.protected)) {
    return;
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
      lastSeenAt: Date.now(),
    });
    await appendEvent({
      type: "TAB_DISCARDED",
      resourceId: resource.id,
      browserTabId: tab.id,
      createdAt: Date.now(),
    });
  }
}

async function discardResources(resourceIds: string[]): Promise<void> {
  const selected = new Set(resourceIds);
  const instances = await db.tabInstances
    .filter((instance) => selected.has(instance.resourceId))
    .toArray();

  for (const instance of instances) {
    try {
      const tab = await chrome.tabs.get(instance.browserTabId);
      if (
        tab.id !== undefined &&
        !tab.active &&
        !tab.pinned &&
        !tab.audible &&
        !tab.discarded
      ) {
        await discardTab(tab as chrome.tabs.Tab & { id: number });
      }
    } catch {
      await db.tabInstances.delete(instance.browserTabId);
    }
  }
  await broadcastChange();
}

async function archiveResources(resourceIds: string[]): Promise<void> {
  const selected = new Set(resourceIds);
  const instances = await db.tabInstances
    .filter((instance) => selected.has(instance.resourceId))
    .toArray();

  for (const instance of instances) {
    try {
      const tab = await chrome.tabs.get(instance.browserTabId);
      await captureTab(tab, "TAB_CAPTURED", false);
    } catch {
      await db.tabInstances.delete(instance.browserTabId);
    }
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
    await chrome.tabs.update(instance.browserTabId, { active: true });
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
  const settings: VaultSettings = {
    ...existing,
    ...patch,
    key: "main",
    autoDiscardMinutes: Math.max(
      5,
      Math.min(1440, patch.autoDiscardMinutes ?? existing.autoDiscardMinutes),
    ),
    snapshotIntervalMinutes: Math.max(
      1,
      Math.min(
        60,
        patch.snapshotIntervalMinutes ?? existing.snapshotIntervalMinutes,
      ),
    ),
    restoreConcurrency: Math.max(
      1,
      Math.min(10, patch.restoreConcurrency ?? existing.restoreConcurrency),
    ),
  };
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
  if (data.format !== "tab-vault" || data.version !== 1) {
    throw new Error(t("unsupportedBackup"));
  }

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

      for (const resource of data.resources) {
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
          resourceIdMap.set(resource.id, resource.id);
          await db.resources.put(resource);
        }
      }

      await db.collections.bulkPut(data.collections);
      await db.rules.bulkPut(data.rules);

      const importedMemberships = data.memberships.map((membership) => {
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

      const importedSnapshots = data.snapshots.map((snapshot) => ({
        ...snapshot,
        tabs: snapshot.tabs.map((tab) => ({
          ...tab,
          resourceId: resourceIdMap.get(tab.resourceId) ?? tab.resourceId,
        })),
      }));
      await db.snapshots.bulkPut(importedSnapshots);
      await db.settings.put({
        ...(await ensureDatabaseDefaults()),
        ...data.settings,
        key: "main",
      });
      await db.events.add({
        type: "IMPORT_COMPLETED",
        payload: { resourceCount: data.resources.length },
        createdAt: Date.now(),
      });
    },
  );

  await scheduleMaintenance(data.settings);
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

async function handleCommand(command: VaultCommand): Promise<unknown> {
  await ensureBootstrapped();

  switch (command.type) {
    case "GET_STATE":
      return getVaultState();
    case "REFRESH_TABS":
      await syncOpenTabs();
      return getVaultState();
    case "DISCARD_RESOURCES":
      await discardResources(command.resourceIds);
      return undefined;
    case "ARCHIVE_RESOURCES":
      await archiveResources(command.resourceIds);
      return undefined;
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
    _sender,
    sendResponse: (response: VaultResponse<unknown>) => void,
  ) => {
    void handleCommand(message)
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
  queueTabCapture(tabId);
});

chrome.tabs.onMoved.addListener((tabId) => {
  queueTabCapture(tabId);
});

chrome.tabs.onAttached.addListener((tabId) => {
  queueTabCapture(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void removeTabInstance(removedTabId);
  queueTabCapture(addedTabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabInstance(tabId);
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
