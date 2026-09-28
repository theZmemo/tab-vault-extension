import Dexie, { type EntityTable } from "dexie";
import type {
  Collection,
  CollectionMembership,
  Resource,
  Rule,
  Snapshot,
  TabInstance,
  VaultEvent,
  VaultExport,
  VaultSettings,
  VaultState,
} from "./types";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

export class TabVaultDatabase extends Dexie {
  resources!: EntityTable<Resource, "id">;
  tabInstances!: EntityTable<TabInstance, "browserTabId">;
  collections!: EntityTable<Collection, "id">;
  memberships!: EntityTable<CollectionMembership, "id">;
  rules!: EntityTable<Rule, "id">;
  events!: EntityTable<VaultEvent, "sequence">;
  snapshots!: EntityTable<Snapshot, "id">;
  settings!: EntityTable<VaultSettings, "key">;

  constructor() {
    super("tab-vault");
    this.version(1).stores({
      resources:
        "&id,&dedupeKey,domain,createdAt,updatedAt,lastVisitedAt,trashedAt",
      tabInstances:
        "&browserTabId,resourceId,windowId,discarded,lastAccessed,lastSeenAt",
      collections: "&id,name,createdAt",
      memberships:
        "&id,collectionId,resourceId,[collectionId+resourceId],ruleId,createdAt",
      rules: "&id,collectionId,priority,createdAt",
      events: "++sequence,type,resourceId,browserTabId,createdAt",
      snapshots: "&id,type,createdAt,checksum",
      settings: "&key",
    });
  }
}

export const db = new TabVaultDatabase();

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function membershipId(
  collectionId: string,
  resourceId: string,
): string {
  return `${collectionId}:${resourceId}`;
}

export async function ensureDatabaseDefaults(): Promise<VaultSettings> {
  const existing = await db.settings.get("main");
  if (existing) {
    const {
      navigationSide: _legacyNavigationSide,
      ...supportedSettings
    } = existing as VaultSettings & { navigationSide?: unknown };
    const merged = normalizeSettings(supportedSettings);
    if (
      _legacyNavigationSide !== undefined ||
      existing.autoCapture !== merged.autoCapture ||
      existing.autoDiscardEnabled !== merged.autoDiscardEnabled ||
      existing.autoDiscardMinutes !== merged.autoDiscardMinutes ||
      existing.snapshotIntervalMinutes !== merged.snapshotIntervalMinutes ||
      existing.restoreConcurrency !== merged.restoreConcurrency ||
      existing.recentClosedRetentionDays !==
        merged.recentClosedRetentionDays ||
      existing.collectionSort !== merged.collectionSort ||
      existing.deepSleepWarningAccepted !==
        merged.deepSleepWarningAccepted ||
      existing.deepSleepWarningVersion !== merged.deepSleepWarningVersion
    ) {
      await db.settings.put(merged);
    }
    return merged;
  }

  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function getVaultState(): Promise<VaultState> {
  const [
    resources,
    instances,
    collections,
    memberships,
    rules,
    snapshots,
    settings,
  ] = await Promise.all([
    db.resources.toArray(),
    db.tabInstances.toArray(),
    db.collections.orderBy("createdAt").toArray(),
    db.memberships.toArray(),
    db.rules.orderBy("priority").toArray(),
    db.snapshots.orderBy("createdAt").reverse().limit(100).toArray(),
    ensureDatabaseDefaults(),
  ]);

  return {
    resources,
    instances,
    collections,
    memberships,
    rules,
    snapshots,
    settings,
    generatedAt: Date.now(),
  };
}

export async function appendEvent(event: VaultEvent): Promise<number> {
  return (await db.events.add(event)) as number;
}

export async function exportVaultData(): Promise<VaultExport> {
  const state = await getVaultState();
  return {
    format: "tab-vault",
    version: 1,
    exportedAt: Date.now(),
    resources: state.resources,
    collections: state.collections,
    memberships: state.memberships,
    rules: state.rules,
    snapshots: state.snapshots,
    settings: state.settings,
  };
}
