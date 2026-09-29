import { t } from "./i18n";
import type {
  Collection,
  Resource,
  Rule,
  Snapshot,
  SnapshotTab,
  VaultExport,
  VaultSettings,
} from "./types";
import { normalizeUrl } from "./url";

const COLLECTION_COLORS = new Set<Collection["color"]>([
  "blue",
  "navy",
  "sky",
  "cyan",
  "teal",
  "mint",
  "green",
  "lime",
  "olive",
  "amber",
  "gold",
  "orange",
  "coral",
  "red",
  "rose",
  "pink",
  "violet",
  "plum",
  "indigo",
  "gray",
]);

const TAB_GROUP_COLORS = new Set<NonNullable<SnapshotTab["groupColor"]>>([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
]);

const SORT_MODES = new Set<VaultSettings["collectionSort"]>([
  "manual",
  "name",
  "count",
  "recent",
]);

function rejectInvalidBackup(): never {
  throw new Error(t("invalidBackup"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isResource(value: unknown): value is Resource {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.originalUrl) &&
    normalizeUrl(value.originalUrl) !== null &&
    isNonEmptyString(value.normalizedUrl) &&
    isNonEmptyString(value.dedupeKey) &&
    isNonEmptyString(value.title) &&
    isOptionalString(value.customTitle) &&
    isNonEmptyString(value.domain) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.lastVisitedAt) &&
    isFiniteNumber(value.visitCount) &&
    typeof value.protected === "boolean" &&
    (value.blockedCollectionIds === undefined ||
      isStringArray(value.blockedCollectionIds)) &&
    typeof value.notes === "string" &&
    (value.trashedAt === undefined || isFiniteNumber(value.trashedAt))
  );
}

function isCollection(value: unknown): value is Collection {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    COLLECTION_COLORS.has(value.color as Collection["color"]) &&
    isFiniteNumber(value.createdAt) &&
    (value.sortOrder === undefined || isFiniteNumber(value.sortOrder)) &&
    (value.autoArchiveMinutes === null ||
      isFiniteNumber(value.autoArchiveMinutes))
  );
}

function isRule(value: unknown): value is Rule {
  if (!isRecord(value)) {
    return false;
  }
  const hasCondition =
    (Array.isArray(value.domains) && value.domains.length > 0) ||
    (Array.isArray(value.titleKeywords) &&
      value.titleKeywords.length > 0) ||
    (Array.isArray(value.urlKeywords) && value.urlKeywords.length > 0);
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.collectionId) &&
    typeof value.enabled === "boolean" &&
    isFiniteNumber(value.priority) &&
    (value.matchMode === "all" || value.matchMode === "any") &&
    isStringArray(value.domains) &&
    isStringArray(value.titleKeywords) &&
    isStringArray(value.urlKeywords) &&
    isStringArray(value.excludedDomains) &&
    hasCondition &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
  );
}

function isSnapshotTab(value: unknown): value is SnapshotTab {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.resourceId) &&
    isNonEmptyString(value.url) &&
    normalizeUrl(value.url) !== null &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.windowKey) &&
    isFiniteNumber(value.index) &&
    typeof value.pinned === "boolean" &&
    typeof value.active === "boolean" &&
    isOptionalString(value.groupKey) &&
    isOptionalString(value.groupTitle) &&
    (value.groupColor === undefined ||
      TAB_GROUP_COLORS.has(
        value.groupColor as NonNullable<SnapshotTab["groupColor"]>,
      )) &&
    (value.groupCollapsed === undefined ||
      typeof value.groupCollapsed === "boolean")
  );
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    (value.type === "automatic" || value.type === "manual") &&
    isFiniteNumber(value.createdAt) &&
    typeof value.checksum === "string" &&
    Array.isArray(value.tabs) &&
    value.tabs.every(isSnapshotTab)
  );
}

function isSettings(value: unknown): value is VaultSettings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.autoCapture === "boolean" &&
    typeof value.autoDiscardEnabled === "boolean" &&
    isFiniteNumber(value.autoDiscardMinutes) &&
    isFiniteNumber(value.snapshotIntervalMinutes) &&
    isFiniteNumber(value.restoreConcurrency) &&
    isFiniteNumber(value.recentClosedRetentionDays) &&
    SORT_MODES.has(value.collectionSort as VaultSettings["collectionSort"]) &&
    (value.deepSleepWarningAccepted === undefined ||
      typeof value.deepSleepWarningAccepted === "boolean") &&
    (value.deepSleepWarningVersion === undefined ||
      isFiniteNumber(value.deepSleepWarningVersion)) &&
    (value.deepSleepLegacyRecoveryVersion === undefined ||
      isFiniteNumber(value.deepSleepLegacyRecoveryVersion))
  );
}

function hasUniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function parseVaultExport(value: unknown): VaultExport {
  if (
    !isRecord(value) ||
    value.format !== "tab-vault" ||
    value.version !== 1 ||
    !isFiniteNumber(value.exportedAt) ||
    !Array.isArray(value.resources) ||
    !value.resources.every(isResource) ||
    !Array.isArray(value.collections) ||
    !value.collections.every(isCollection) ||
    !Array.isArray(value.memberships) ||
    !Array.isArray(value.rules) ||
    !value.rules.every(isRule) ||
    !Array.isArray(value.snapshots) ||
    !value.snapshots.every(isSnapshot) ||
    !isSettings(value.settings)
  ) {
    rejectInvalidBackup();
  }

  const data = value as unknown as VaultExport;
  if (
    !hasUniqueIds(data.resources) ||
    !hasUniqueIds(data.collections) ||
    !hasUniqueIds(data.memberships) ||
    !hasUniqueIds(data.rules) ||
    !hasUniqueIds(data.snapshots)
  ) {
    rejectInvalidBackup();
  }

  const resourceIds = new Set(data.resources.map((resource) => resource.id));
  const collectionIds = new Set(
    data.collections.map((collection) => collection.id),
  );

  const membershipsAreValid = data.memberships.every(
    (membership) =>
      isRecord(membership) &&
      isNonEmptyString(membership.id) &&
      isNonEmptyString(membership.collectionId) &&
      collectionIds.has(membership.collectionId) &&
      isNonEmptyString(membership.resourceId) &&
      resourceIds.has(membership.resourceId) &&
      ["manual", "rule", "import"].includes(String(membership.source)) &&
      isOptionalString(membership.ruleId) &&
      isFiniteNumber(membership.createdAt),
  );
  const referencesAreValid =
    membershipsAreValid &&
    data.rules.every((rule) => collectionIds.has(rule.collectionId)) &&
    data.snapshots.every((snapshot) =>
      snapshot.tabs.every((tab) => resourceIds.has(tab.resourceId)),
    );

  if (!referencesAreValid) {
    rejectInvalidBackup();
  }
  return data;
}
