import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("fills missing values with release defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps numeric settings to supported integer ranges", () => {
    expect(
      normalizeSettings({
        autoDiscardMinutes: 1,
        snapshotIntervalMinutes: 90,
        restoreConcurrency: 3.7,
        recentClosedRetentionDays: Number.NaN,
      }),
    ).toMatchObject({
      autoDiscardMinutes: 5,
      snapshotIntervalMinutes: 60,
      restoreConcurrency: 4,
      recentClosedRetentionDays: 30,
    });
  });

  it("rejects unsupported sort values at runtime", () => {
    expect(
      normalizeSettings({
        collectionSort: "unsupported",
      } as unknown as Partial<typeof DEFAULT_SETTINGS>),
    ).toMatchObject({
      collectionSort: "manual",
    });
  });
});
