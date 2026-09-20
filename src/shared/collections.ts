import type {
  Collection,
  CollectionMembership,
  Resource,
  VaultSettings,
} from "./types";

export function sortCollections(
  collections: Collection[],
  memberships: CollectionMembership[],
  resources: Resource[],
  mode: VaultSettings["collectionSort"],
  locale?: string,
): Collection[] {
  const membershipCounts = new Map<string, number>();
  const latestVisits = new Map<string, number>();
  const resourceById = new Map(
    resources.map((resource) => [resource.id, resource]),
  );

  for (const membership of memberships) {
    membershipCounts.set(
      membership.collectionId,
      (membershipCounts.get(membership.collectionId) ?? 0) + 1,
    );
    const lastVisitedAt =
      resourceById.get(membership.resourceId)?.lastVisitedAt ?? 0;
    latestVisits.set(
      membership.collectionId,
      Math.max(latestVisits.get(membership.collectionId) ?? 0, lastVisitedAt),
    );
  }

  const fallbackOrder = (collection: Collection) =>
    collection.sortOrder ?? collection.createdAt;

  return [...collections].sort((left, right) => {
    if (mode === "name") {
      return (
        left.name.localeCompare(right.name, locale) ||
        fallbackOrder(left) - fallbackOrder(right)
      );
    }
    if (mode === "count") {
      return (
        (membershipCounts.get(right.id) ?? 0) -
          (membershipCounts.get(left.id) ?? 0) ||
        fallbackOrder(left) - fallbackOrder(right)
      );
    }
    if (mode === "recent") {
      return (
        (latestVisits.get(right.id) ?? 0) -
          (latestVisits.get(left.id) ?? 0) ||
        fallbackOrder(left) - fallbackOrder(right)
      );
    }
    return fallbackOrder(left) - fallbackOrder(right);
  });
}
