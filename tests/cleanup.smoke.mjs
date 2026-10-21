import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const artifactsPath =
  process.env.TAB_VAULT_ARTIFACTS ?? join(projectRoot, "artifacts");
const requestedLocale = process.env.TAB_VAULT_TEST_LOCALE ?? "zh-CN";
const requestedTheme = process.env.TAB_VAULT_TEST_THEME ?? "light";
const localeKey = requestedLocale.toLowerCase().replaceAll("-", "_");
const copy = {
  "zh-CN": {
    appName: "标签资产库",
    settings: "设置",
    openCleanup: "查看可清理记录",
    cleanupTitle: "存储清理",
    summary: "9 个资源中有 3 个可清理",
    deleteSelected: "删除所选记录",
    selectAll: "选择全部候选",
    selectedCount: "3 项",
    confirmTitle: "确认永久删除",
    confirmDelete: "确认永久删除",
    partial: "已删除 2 条；另有 1 条因状态变化被跳过。",
  },
  "de-DE": {
    appName: "Tab Vault",
    settings: "Einstellungen",
    openCleanup: "Bereinigungskandidaten prüfen",
    cleanupTitle: "Speicherbereinigung",
    summary: "3 von 9 Ressourcen können bereinigt werden",
    deleteSelected: "Auswahl löschen",
    selectAll: "Alle Kandidaten auswählen",
    selectedCount: "3 ausgewählt",
    confirmTitle: "Endgültiges Löschen bestätigen",
    confirmDelete: "Endgültig löschen",
    partial:
      "2 Einträge gelöscht; 1 wegen Statusänderungen übersprungen.",
  },
}[requestedLocale];
if (!copy) {
  throw new Error(`Unsupported cleanup-test locale: ${requestedLocale}`);
}
const profilePath = join(
  tmpdir(),
  `tab-vault-cleanup-${Date.now().toString(36)}`,
);
const DAY_MS = 24 * 60 * 60 * 1_000;
const now = Date.now();

function makeResource(id, patch = {}) {
  return {
    id,
    originalUrl: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    dedupeKey: id,
    title: `清理测试 ${id}`,
    domain: "example.com",
    createdAt: now - 180 * DAY_MS,
    updatedAt: now - 120 * DAY_MS,
    lastVisitedAt: now - 120 * DAY_MS,
    visitCount: 1,
    protected: false,
    notes: "",
    ...patch,
  };
}

await mkdir(artifactsPath, { recursive: true });

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    locale: requestedLocale,
    colorScheme: requestedTheme,
    viewport: { width: 390, height: 844 },
    env: {
      ...process.env,
      HOME: profilePath,
    },
    args: [
      "--disable-breakpad",
      "--disable-crashpad",
      "--disable-crash-reporter",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let serviceWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith("chrome-extension://"));
  serviceWorker ??= await context.waitForEvent("serviceworker", {
    predicate: (worker) => worker.url().startsWith("chrome-extension://"),
    timeout: 15_000,
  });
  const extensionId = new URL(serviceWorker.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    panel.getByText(copy.appName, { exact: true }),
  ).toBeVisible();

  const resources = [
    makeResource("candidate-old"),
    makeResource("automatic-snapshot-old"),
    makeResource("state-change-old"),
    makeResource("grouped-old"),
    makeResource("protected-old", { protected: true }),
    makeResource("noted-old", { notes: "保留" }),
    makeResource("renamed-old", { customTitle: "保留名称" }),
    makeResource("recent", { lastVisitedAt: now - 20 * DAY_MS }),
    makeResource("manual-snapshot-old"),
  ];
  const cleanupCollection = {
    id: "cleanup-protected-group",
    name: "保留分组",
    color: "blue",
    createdAt: now,
    sortOrder: 0,
    autoArchiveMinutes: null,
  };
  const response = await panel.evaluate(
    async ({ resources, cleanupCollection, now }) =>
      chrome.runtime.sendMessage({
        type: "IMPORT_DATA",
        data: {
          format: "tab-vault",
          version: 1,
          exportedAt: now,
          resources,
          collections: [cleanupCollection],
          memberships: [
            {
              id: `${cleanupCollection.id}:grouped-old`,
              collectionId: cleanupCollection.id,
              resourceId: "grouped-old",
              source: "manual",
              createdAt: now,
            },
          ],
          rules: [],
          snapshots: [
            {
              id: "manual-cleanup-snapshot",
              type: "manual",
              createdAt: now,
              checksum: "manual-cleanup-snapshot",
              tabs: [
                {
                  resourceId: "manual-snapshot-old",
                  url: "https://example.com/manual-snapshot-old",
                  title: "清理测试 manual-snapshot-old",
                  windowKey: "window",
                  index: 0,
                  pinned: false,
                  active: false,
                },
              ],
            },
            {
              id: "automatic-cleanup-snapshot",
              type: "automatic",
              createdAt: now,
              checksum: "automatic-cleanup-snapshot",
              tabs: [
                {
                  resourceId: "automatic-snapshot-old",
                  url: "https://example.com/automatic-snapshot-old",
                  title: "清理测试 automatic-snapshot-old",
                  windowKey: "window",
                  index: 0,
                  pinned: false,
                  active: false,
                },
              ],
            },
          ],
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
        },
      }),
    { resources, cleanupCollection, now },
  );
  expect(response?.ok).toBe(true);

  await panel.getByTitle(copy.settings).click();
  await panel
    .getByRole("button", { name: copy.openCleanup })
    .click();
  await expect(
    panel.getByRole("heading", { name: copy.cleanupTitle }),
  ).toBeVisible();
  await expect(
    panel.getByText(copy.summary, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".cleanup-row")).toHaveCount(3);
  await expect(
    panel.getByText("清理测试 candidate-old", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: copy.deleteSelected }),
  ).toBeDisabled();

  const idsBeforeSelection = await panel.evaluate(async () => {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return state.data.resources.map((resource) => resource.id);
  });
  expect(idsBeforeSelection).toContain("candidate-old");
  expect(idsBeforeSelection).toContain("automatic-snapshot-old");

  await panel.screenshot({
    path: join(
      artifactsPath,
      `cleanup-candidates-${localeKey}-${requestedTheme}.png`,
    ),
    fullPage: true,
  });
  await panel.getByText(copy.selectAll, { exact: true }).click();
  await expect(
    panel.getByText(copy.selectedCount, { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: copy.deleteSelected })
    .click();
  await expect(
    panel.getByRole("heading", { name: copy.confirmTitle }),
  ).toBeVisible();

  const protectResponse = await panel.evaluate(
    async (collectionId) =>
      chrome.runtime.sendMessage({
        type: "ADD_TO_COLLECTION",
        collectionId,
        resourceIds: ["state-change-old"],
      }),
    cleanupCollection.id,
  );
  expect(protectResponse?.ok).toBe(true);
  await panel.screenshot({
    path: join(
      artifactsPath,
      `cleanup-confirmation-${localeKey}-${requestedTheme}.png`,
    ),
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: copy.confirmDelete })
    .click();
  await expect(
    panel.getByText(copy.partial, { exact: true }),
  ).toBeVisible();

  const finalState = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return {
      resourceIds: response.data.resources.map((resource) => resource.id),
      snapshotIds: response.data.snapshots.map((snapshot) => snapshot.id),
      groupedIds: response.data.memberships.map(
        (membership) => membership.resourceId,
      ),
    };
  });
  expect(finalState.resourceIds).not.toContain("candidate-old");
  expect(finalState.resourceIds).not.toContain("automatic-snapshot-old");
  expect(finalState.resourceIds).toContain("state-change-old");
  expect(finalState.resourceIds).toContain("manual-snapshot-old");
  expect(finalState.snapshotIds).toContain("manual-cleanup-snapshot");
  expect(finalState.snapshotIds).not.toContain(
    "automatic-cleanup-snapshot",
  );
  expect(finalState.groupedIds).toContain("state-change-old");

  console.log(
    JSON.stringify(
      {
        automaticDeletion: false,
        candidateCount: 3,
        userSelectionRequired: true,
        secondConfirmationRequired: true,
        deleted: 2,
        revalidatedAndSkipped: 1,
        manualSnapshotProtected: true,
        automaticSnapshotPruned: true,
        locale: requestedLocale,
        theme: requestedTheme,
        candidateScreenshot:
          `artifacts/cleanup-candidates-${localeKey}-${requestedTheme}.png`,
        confirmationScreenshot:
          `artifacts/cleanup-confirmation-${localeKey}-${requestedTheme}.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
