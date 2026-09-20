import { describe, expect, it } from "vitest";
import { sortCollections } from "./collections";
import type {
  Collection,
  CollectionMembership,
  Resource,
} from "./types";

const collections: Collection[] = [
  {
    id: "b",
    name: "Beta",
    color: "blue",
    createdAt: 2,
    sortOrder: 1,
    autoArchiveMinutes: null,
  },
  {
    id: "a",
    name: "Alpha",
    color: "green",
    createdAt: 1,
    sortOrder: 0,
    autoArchiveMinutes: null,
  },
];

const resources = [
  { id: "r1", lastVisitedAt: 10 },
  { id: "r2", lastVisitedAt: 20 },
] as Resource[];

const memberships: CollectionMembership[] = [
  {
    id: "a:r1",
    collectionId: "a",
    resourceId: "r1",
    source: "manual",
    createdAt: 1,
  },
  {
    id: "b:r1",
    collectionId: "b",
    resourceId: "r1",
    source: "manual",
    createdAt: 1,
  },
  {
    id: "b:r2",
    collectionId: "b",
    resourceId: "r2",
    source: "manual",
    createdAt: 1,
  },
];

describe("sortCollections", () => {
  it("uses persisted manual order", () => {
    expect(
      sortCollections(collections, memberships, resources, "manual").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("sorts by name, count, and latest visit", () => {
    expect(
      sortCollections(collections, memberships, resources, "name").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      sortCollections(collections, memberships, resources, "count").map(
        (item) => item.id,
      ),
    ).toEqual(["b", "a"]);
    expect(
      sortCollections(collections, memberships, resources, "recent").map(
        (item) => item.id,
      ),
    ).toEqual(["b", "a"]);
  });
});
