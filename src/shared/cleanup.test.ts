import { describe, expect, it } from "vitest";
import {
  findStaleResourceCandidates,
  normalizeStaleResourceDays,
} from "./cleanup";
import type {
  CollectionMembership,
  Resource,
  Snapshot,
  TabInstance,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const now = 200 * DAY_MS;

function makeResource(
  id: string,
  patch: Partial<Resource> = {},
): Resource {
  return {
    id,
    originalUrl: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    dedupeKey: id,
    title: id,
    domain: "example.com",
    createdAt: now - 150 * DAY_MS,
    updatedAt: now - 150 * DAY_MS,
    lastVisitedAt: now - 120 * DAY_MS,
    visitCount: 1,
    protected: false,
    notes: "",
    ...patch,
  };
}

function makeMembership(resourceId: string): CollectionMembership {
  return {
    id: `collection:${resourceId}`,
    collectionId: "collection",
    resourceId,
    source: "manual",
    createdAt: now - DAY_MS,
  };
}

function makeInstance(resourceId: string): TabInstance {
  return {
    browserTabId: 1,
    resourceId,
    windowId: 1,
    index: 0,
    pinned: false,
    active: false,
    discarded: false,
    audible: false,
    groupId: -1,
    lastAccessed: now,
    lastSeenAt: now,
  };
}

function makeSnapshot(
  resourceId: string,
  type: Snapshot["type"],
): Snapshot {
  return {
    id: `${type}:${resourceId}`,
    type,
    createdAt: now,
    checksum: resourceId,
    tabs: [
      {
        resourceId,
        url: `https://example.com/${resourceId}`,
        title: resourceId,
        windowKey: "window",
        index: 0,
        pinned: false,
        active: false,
      },
    ],
  };
}

describe("stale resource cleanup", () => {
  it("returns only old, ungrouped, closed, uncurated resources", () => {
    const candidates = findStaleResourceCandidates(
      {
        resources: [
          makeResource("candidate"),
          makeResource("recent", {
            lastVisitedAt: now - 10 * DAY_MS,
          }),
          makeResource("protected", { protected: true }),
          makeResource("noted", { notes: "Keep this" }),
          makeResource("renamed", { customTitle: "Keep this" }),
          makeResource("trashed", { trashedAt: now - DAY_MS }),
          makeResource("grouped"),
          makeResource("open"),
          makeResource("recovering"),
          makeResource("manual-snapshot"),
        ],
        memberships: [makeMembership("grouped")],
        instances: [makeInstance("open")],
        snapshots: [makeSnapshot("manual-snapshot", "manual")],
        recoveryResourceIds: ["recovering"],
      },
      90,
      now,
    );

    expect(candidates.map((resource) => resource.id)).toEqual(["candidate"]);
  });

  it("does not treat automatic snapshots as an explicit keep signal", () => {
    const candidates = findStaleResourceCandidates(
      {
        resources: [makeResource("automatic-snapshot")],
        memberships: [],
        instances: [],
        snapshots: [makeSnapshot("automatic-snapshot", "automatic")],
      },
      90,
      now,
    );

    expect(candidates.map((resource) => resource.id)).toEqual([
      "automatic-snapshot",
    ]);
  });

  it("includes the cutoff boundary and sorts the oldest first", () => {
    const candidates = findStaleResourceCandidates(
      {
        resources: [
          makeResource("boundary", {
            lastVisitedAt: now - 90 * DAY_MS,
          }),
          makeResource("oldest", {
            lastVisitedAt: now - 180 * DAY_MS,
          }),
        ],
        memberships: [],
        instances: [],
        snapshots: [],
      },
      90,
      now,
    );

    expect(candidates.map((resource) => resource.id)).toEqual([
      "oldest",
      "boundary",
    ]);
  });

  it("normalizes invalid day values", () => {
    expect(normalizeStaleResourceDays(Number.NaN)).toBe(90);
    expect(normalizeStaleResourceDays(0)).toBe(1);
    expect(normalizeStaleResourceDays(9_999)).toBe(3_650);
    expect(normalizeStaleResourceDays(89.6)).toBe(90);
  });
});
