import { describe, expect, it } from "vitest";
import { parseVaultExport } from "./backup";
import type { VaultExport } from "./types";

function makeBackup(): VaultExport {
  return {
    format: "tab-vault",
    version: 1,
    exportedAt: 1_000,
    resources: [
      {
        id: "resource_1",
        originalUrl: "https://example.com/report",
        normalizedUrl: "https://example.com/report",
        dedupeKey: "abc",
        title: "Report",
        domain: "example.com",
        createdAt: 1_000,
        updatedAt: 1_000,
        lastVisitedAt: 1_000,
        visitCount: 1,
        protected: false,
        notes: "",
      },
    ],
    collections: [
      {
        id: "collection_1",
        name: "Reports",
        color: "blue",
        createdAt: 1_000,
        sortOrder: 0,
        autoArchiveMinutes: null,
      },
    ],
    memberships: [
      {
        id: "collection_1:resource_1",
        collectionId: "collection_1",
        resourceId: "resource_1",
        source: "manual",
        createdAt: 1_000,
      },
    ],
    rules: [],
    snapshots: [],
    settings: {
      key: "main",
      autoCapture: true,
      autoDiscardEnabled: true,
      autoDiscardMinutes: 30,
      snapshotIntervalMinutes: 5,
      restoreConcurrency: 5,
      recentClosedRetentionDays: 30,
      collectionSort: "manual",
      deepSleepWarningAccepted: false,
      deepSleepWarningVersion: 0,
      deepSleepLegacyRecoveryVersion: 0,
      savedTitleMigrationVersion: 0,
    },
  };
}

describe("parseVaultExport", () => {
  it("accepts a complete backup with valid relationships", () => {
    expect(parseVaultExport(makeBackup())).toEqual(makeBackup());
  });

  it("accepts provisional title state and rejects invalid values", () => {
    const backup = makeBackup();
    backup.resources[0].savedTitle = "Report";
    backup.resources[0].savedTitleAt = 1_000;
    backup.resources[0].savedTitleProvisional = true;
    expect(
      parseVaultExport(backup).resources[0].savedTitleProvisional,
    ).toBe(true);

    const invalid = makeBackup() as unknown as {
      resources: Array<Record<string, unknown>>;
    };
    invalid.resources[0].savedTitleProvisional = "yes";
    expect(() => parseVaultExport(invalid)).toThrow();
  });

  it("accepts pinned resource order and rejects invalid pin state", () => {
    const backup = makeBackup();
    backup.resources[0].pinned = true;
    backup.resources[0].pinOrder = 0;
    backup.resources[0].pinnedAt = 1_000;
    expect(parseVaultExport(backup).resources[0]).toMatchObject({
      pinned: true,
      pinOrder: 0,
      pinnedAt: 1_000,
    });

    const invalid = makeBackup() as unknown as {
      resources: Array<Record<string, unknown>>;
    };
    invalid.resources[0].pinned = "yes";
    expect(() => parseVaultExport(invalid)).toThrow();
  });

  it.each(["aqua", "yellow", "brown", "lavender"] as const)(
    "accepts the new %s collection color",
    (color) => {
      const backup = makeBackup();
      backup.collections[0].color = color;
      expect(parseVaultExport(backup).collections[0].color).toBe(color);
    },
  );

  it("rejects missing collections", () => {
    const backup = makeBackup() as unknown as Record<string, unknown>;
    delete backup.collections;
    expect(() => parseVaultExport(backup)).toThrow();
  });

  it("rejects unsupported URLs", () => {
    const backup = makeBackup();
    backup.resources[0].originalUrl = "javascript:alert(1)";
    expect(() => parseVaultExport(backup)).toThrow();
  });

  it("accepts backups created before the deep-sleep warning setting", () => {
    const backup = makeBackup() as unknown as {
      settings: Record<string, unknown>;
    };
    delete backup.settings.deepSleepWarningAccepted;
    delete backup.settings.deepSleepWarningVersion;
    delete backup.settings.deepSleepLegacyRecoveryVersion;
    delete backup.settings.savedTitleMigrationVersion;
    expect(parseVaultExport(backup).settings.deepSleepWarningAccepted).toBe(
      undefined,
    );
  });

  it("rejects orphaned memberships", () => {
    const backup = makeBackup();
    backup.memberships[0].resourceId = "resource_missing";
    expect(() => parseVaultExport(backup)).toThrow();
  });
});
