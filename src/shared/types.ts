export type ResourceRuntimeState =
  | "open"
  | "discarded"
  | "deep-sleeping"
  | "virtual"
  | "trashed";

export interface Resource {
  id: string;
  originalUrl: string;
  normalizedUrl: string;
  dedupeKey: string;
  title: string;
  customTitle?: string;
  domain: string;
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
  visitCount: number;
  protected: boolean;
  blockedCollectionIds?: string[];
  notes: string;
  trashedAt?: number;
}

export interface TabInstance {
  browserTabId: number;
  resourceId: string;
  windowId: number;
  index: number;
  pinned: boolean;
  active: boolean;
  discarded: boolean;
  deepSleeping?: boolean;
  audible: boolean;
  groupId: number;
  lastAccessed: number;
  lastSeenAt: number;
}

export interface DeepSleepRecovery {
  id: string;
  browserTabId?: number;
  resourceId: string;
  originalUrl: string;
  title: string;
  windowId: number;
  index: number;
  pinned: boolean;
  groupId: number;
  groupKey?: string;
  groupTitle?: string;
  groupColor?: chrome.tabGroups.TabGroup["color"];
  groupCollapsed?: boolean;
  createdAt: number;
  pendingRemovalAt?: number;
}

export type CollectionColor =
  | "blue"
  | "navy"
  | "sky"
  | "cyan"
  | "teal"
  | "mint"
  | "green"
  | "lime"
  | "olive"
  | "amber"
  | "gold"
  | "orange"
  | "coral"
  | "red"
  | "rose"
  | "pink"
  | "violet"
  | "plum"
  | "indigo"
  | "gray";

export interface Collection {
  id: string;
  name: string;
  color: CollectionColor;
  createdAt: number;
  sortOrder?: number;
  autoArchiveMinutes: number | null;
}

export interface CollectionMembership {
  id: string;
  collectionId: string;
  resourceId: string;
  source: "manual" | "rule" | "import";
  ruleId?: string;
  createdAt: number;
}

export type RuleMatchMode = "all" | "any";

export interface Rule {
  id: string;
  name: string;
  collectionId: string;
  enabled: boolean;
  priority: number;
  matchMode: RuleMatchMode;
  domains: string[];
  titleKeywords: string[];
  urlKeywords: string[];
  excludedDomains: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotTab {
  resourceId: string;
  url: string;
  title: string;
  windowKey: string;
  index: number;
  pinned: boolean;
  active: boolean;
  groupKey?: string;
  groupTitle?: string;
  groupColor?: chrome.tabGroups.TabGroup["color"];
  groupCollapsed?: boolean;
}

export interface Snapshot {
  id: string;
  type: "automatic" | "manual";
  createdAt: number;
  checksum: string;
  tabs: SnapshotTab[];
}

export interface VaultEvent {
  sequence?: number;
  type:
    | "TAB_CAPTURED"
    | "TAB_CLOSED"
    | "TAB_DISCARD_PREPARED"
    | "TAB_DISCARDED"
    | "TAB_DEEP_SLEEP_PREPARED"
    | "TAB_DEEP_SLEEP_COMMITTED"
    | "TAB_DEEP_SLEEP_RESTORED"
    | "ARCHIVE_PREPARED"
    | "ARCHIVE_COMMITTED"
    | "RESOURCE_RESTORED"
    | "RESOURCE_RENAMED"
    | "SNAPSHOT_CREATED"
    | "IMPORT_COMPLETED";
  resourceId?: string;
  browserTabId?: number;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface VaultSettings {
  key: "main";
  autoCapture: boolean;
  autoDiscardEnabled: boolean;
  autoDiscardMinutes: number;
  snapshotIntervalMinutes: number;
  restoreConcurrency: number;
  recentClosedRetentionDays: number;
  collectionSort: "manual" | "name" | "count" | "recent";
  deepSleepWarningAccepted: boolean;
  deepSleepWarningVersion: number;
  deepSleepLegacyRecoveryVersion: number;
}

export interface VaultState {
  resources: Resource[];
  instances: TabInstance[];
  collections: Collection[];
  memberships: CollectionMembership[];
  rules: Rule[];
  snapshots: Snapshot[];
  settings: VaultSettings;
  generatedAt: number;
}

export interface CreateRuleInput {
  name: string;
  collectionId: string;
  matchMode: RuleMatchMode;
  domains: string[];
  titleKeywords: string[];
  urlKeywords: string[];
}

export interface VaultExport {
  format: "tab-vault";
  version: 1;
  exportedAt: number;
  resources: Resource[];
  collections: Collection[];
  memberships: CollectionMembership[];
  rules: Rule[];
  snapshots: Snapshot[];
  settings: VaultSettings;
}

export type VaultCommand =
  | { type: "GET_STATE" }
  | { type: "REFRESH_TABS" }
  | { type: "DISCARD_RESOURCES"; resourceIds: string[] }
  | {
      type: "DISCARD_ELIGIBLE_TABS";
      scope: "window" | "all" | "force-all";
      windowId?: number;
    }
  | { type: "DEEP_SLEEP_ELIGIBLE_TABS" }
  | { type: "RESTORE_DEEP_SLEEP_TAB" }
  | { type: "ARCHIVE_RESOURCES"; resourceIds: string[] }
  | { type: "DELETE_RESOURCES"; resourceIds: string[] }
  | { type: "RESTORE_RESOURCES"; resourceIds: string[] }
  | { type: "FOCUS_RESOURCE"; resourceId: string }
  | { type: "CREATE_SNAPSHOT" }
  | { type: "RESTORE_SNAPSHOT"; snapshotId: string }
  | {
      type: "CREATE_COLLECTION";
      name: string;
      color: CollectionColor;
    }
  | {
      type: "UPDATE_COLLECTION";
      collectionId: string;
      name: string;
      color: CollectionColor;
    }
  | { type: "DELETE_COLLECTION"; collectionId: string }
  | {
      type: "ADD_TO_COLLECTION";
      collectionId: string;
      resourceIds: string[];
    }
  | {
      type: "REMOVE_FROM_COLLECTION";
      collectionId: string;
      resourceIds: string[];
    }
  | { type: "REORDER_COLLECTIONS"; collectionIds: string[] }
  | {
      type: "MOVE_RESOURCE_COLLECTION";
      resourceId: string;
      sourceCollectionId: string;
      targetCollectionId?: string;
    }
  | { type: "CREATE_RULE"; rule: CreateRuleInput }
  | { type: "DELETE_RULE"; ruleId: string }
  | { type: "RESCAN_RULES" }
  | { type: "UPDATE_SETTINGS"; settings: Partial<VaultSettings> }
  | {
      type: "UPDATE_RESOURCE_TITLE";
      resourceId: string;
      customTitle: string;
    }
  | { type: "TOGGLE_PROTECTED"; resourceId: string }
  | { type: "IMPORT_DATA"; data: VaultExport };

export interface VaultResponse<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}
