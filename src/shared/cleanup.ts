import type {
  CollectionMembership,
  Resource,
  Snapshot,
  TabInstance,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const DEFAULT_STALE_RESOURCE_DAYS = 90;
export const STALE_RESOURCE_DAY_OPTIONS = [30, 60, 90, 180, 365] as const;

export interface StaleResourceSource {
  resources: readonly Resource[];
  instances: readonly TabInstance[];
  memberships: readonly CollectionMembership[];
  snapshots: readonly Snapshot[];
  recoveryResourceIds?: Iterable<string>;
}

export function normalizeStaleResourceDays(days: number): number {
  if (!Number.isFinite(days)) {
    return DEFAULT_STALE_RESOURCE_DAYS;
  }
  return Math.max(1, Math.min(3_650, Math.round(days)));
}

export function findStaleResourceCandidates(
  source: StaleResourceSource,
  inactiveDays: number,
  now = Date.now(),
): Resource[] {
  const cutoff =
    now - normalizeStaleResourceDays(inactiveDays) * DAY_MS;
  const openResourceIds = new Set(
    source.instances.map((instance) => instance.resourceId),
  );
  const groupedResourceIds = new Set(
    source.memberships.map((membership) => membership.resourceId),
  );
  const manuallySavedResourceIds = new Set(
    source.snapshots
      .filter((snapshot) => snapshot.type === "manual")
      .flatMap((snapshot) => snapshot.tabs.map((tab) => tab.resourceId)),
  );
  const recoveryResourceIds = new Set(source.recoveryResourceIds ?? []);

  return source.resources
    .filter(
      (resource) =>
        resource.trashedAt === undefined &&
        resource.lastVisitedAt <= cutoff &&
        !resource.protected &&
        !resource.notes.trim() &&
        !resource.customTitle?.trim() &&
        !openResourceIds.has(resource.id) &&
        !groupedResourceIds.has(resource.id) &&
        !manuallySavedResourceIds.has(resource.id) &&
        !recoveryResourceIds.has(resource.id),
    )
    .sort(
      (left, right) =>
        left.lastVisitedAt - right.lastVisitedAt ||
        left.id.localeCompare(right.id),
    );
}
