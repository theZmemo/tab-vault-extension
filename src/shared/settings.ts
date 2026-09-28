import type { VaultSettings } from "./types";

export const DEFAULT_SETTINGS: VaultSettings = {
  key: "main",
  autoCapture: true,
  autoDiscardEnabled: true,
  autoDiscardMinutes: 30,
  snapshotIntervalMinutes: 5,
  restoreConcurrency: 5,
  recentClosedRetentionDays: 30,
  collectionSort: "manual",
  deepSleepWarningAccepted: false,
};

const COLLECTION_SORT_MODES = new Set<VaultSettings["collectionSort"]>([
  "manual",
  "name",
  "count",
  "recent",
]);

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function normalizeSettings(
  input: Partial<VaultSettings> | null | undefined,
): VaultSettings {
  return {
    key: "main",
    autoCapture:
      typeof input?.autoCapture === "boolean"
        ? input.autoCapture
        : DEFAULT_SETTINGS.autoCapture,
    autoDiscardEnabled:
      typeof input?.autoDiscardEnabled === "boolean"
        ? input.autoDiscardEnabled
        : DEFAULT_SETTINGS.autoDiscardEnabled,
    autoDiscardMinutes: boundedNumber(
      input?.autoDiscardMinutes,
      DEFAULT_SETTINGS.autoDiscardMinutes,
      5,
      1440,
    ),
    snapshotIntervalMinutes: boundedNumber(
      input?.snapshotIntervalMinutes,
      DEFAULT_SETTINGS.snapshotIntervalMinutes,
      1,
      60,
    ),
    restoreConcurrency: boundedNumber(
      input?.restoreConcurrency,
      DEFAULT_SETTINGS.restoreConcurrency,
      1,
      10,
    ),
    recentClosedRetentionDays: boundedNumber(
      input?.recentClosedRetentionDays,
      DEFAULT_SETTINGS.recentClosedRetentionDays,
      1,
      365,
    ),
    collectionSort:
      input?.collectionSort &&
      COLLECTION_SORT_MODES.has(input.collectionSort)
        ? input.collectionSort
        : DEFAULT_SETTINGS.collectionSort,
    deepSleepWarningAccepted:
      typeof input?.deepSleepWarningAccepted === "boolean"
        ? input.deepSleepWarningAccepted
        : DEFAULT_SETTINGS.deepSleepWarningAccepted,
  };
}
