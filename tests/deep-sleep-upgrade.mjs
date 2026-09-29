import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionRoot = join(projectRoot, "dist");
const profileRoot = join(
  tmpdir(),
  `tab-vault-recovery-${Date.now().toString(36)}`,
);
const originalUrl = "http://127.0.0.1:4181/reload-recovery?id=105";

const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<title>Reload Recovery Fixture</title><h1>Recovery</h1>");
});

await new Promise((resolveServer) =>
  server.listen(4181, "127.0.0.1", resolveServer),
);

let context;
try {
  context = await chromium.launchPersistentContext(profileRoot, {
    channel: "chromium",
    headless: true,
    locale: "zh-CN",
    viewport: { width: 480, height: 780 },
    env: {
      ...process.env,
      HOME: profileRoot,
    },
    args: [
      "--disable-breakpad",
      "--disable-crash-reporter",
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
    ],
  });

  let worker = context
    .serviceWorkers()
    .find((item) => item.url().startsWith("chrome-extension://"));
  worker ??= await context.waitForEvent("serviceworker", {
    predicate: (item) => item.url().startsWith("chrome-extension://"),
    timeout: 15_000,
  });
  const extensionId = new URL(worker.url()).host;
  const sourcePage = await context.newPage();
  await sourcePage.goto(originalUrl);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    panel.getByText("标签资产库", { exact: true }),
  ).toBeVisible();

  const capturedResource = await panel.evaluate(async (targetUrl) => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data.resources.find(
      (resource) => resource.originalUrl === targetUrl,
    );
  }, originalUrl);
  expect(capturedResource).toBeTruthy();
  await sourcePage.close();

  await panel.evaluate(
    async ({ resourceId, targetUrl, title }) => {
      const database = await new Promise((resolveDatabase, rejectDatabase) => {
        const request = indexedDB.open("tab-vault");
        request.onerror = () => rejectDatabase(request.error);
        request.onsuccess = () => resolveDatabase(request.result);
      });
      const transaction = database.transaction(
        ["events", "settings", "deepSleepRecoveries"],
        "readwrite",
      );
      const settingsStore = transaction.objectStore("settings");
      const settings = await new Promise((resolveSettings, rejectSettings) => {
        const request = settingsStore.get("main");
        request.onerror = () => rejectSettings(request.error);
        request.onsuccess = () => resolveSettings(request.result);
      });
      settingsStore.put({
        ...settings,
        deepSleepLegacyRecoveryVersion: 0,
      });
      transaction.objectStore("deepSleepRecoveries").clear();
      transaction.objectStore("events").add({
        type: "TAB_DEEP_SLEEP_COMMITTED",
        resourceId,
        browserTabId: 987_654_321,
        payload: { originalUrl: targetUrl, title },
        createdAt: Date.now(),
      });
      await new Promise((resolveTransaction, rejectTransaction) => {
        transaction.oncomplete = resolveTransaction;
        transaction.onerror = () => rejectTransaction(transaction.error);
      });
      database.close();
    },
    {
      resourceId: capturedResource.id,
      targetUrl: originalUrl,
      title: capturedResource.title,
    },
  );

  const refreshResponse = await panel.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "REFRESH_TABS" }),
  );
  expect(refreshResponse.ok).toBe(true);
  await expect
    .poll(
      () =>
        worker.evaluate(async (targetUrl) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((candidate) => {
            try {
              const url = new URL(candidate.url ?? "");
              if (!url.pathname.endsWith("/suspended.html")) {
                return false;
              }
              const payload = JSON.parse(
                decodeURIComponent(url.hash.slice(1)),
              );
              return payload.url === targetUrl;
            } catch {
              return false;
            }
          });
          return tab?.id ?? null;
        }, originalUrl),
      { timeout: 15_000 },
    )
    .not.toBeNull();

  const recoveryState = await panel.evaluate(
    () =>
      new Promise((resolveRecovery, rejectRecovery) => {
        const request = indexedDB.open("tab-vault");
        request.onerror = () => rejectRecovery(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            "deepSleepRecoveries",
            "readonly",
          );
          const getAll = transaction
            .objectStore("deepSleepRecoveries")
            .getAll();
          getAll.onerror = () => rejectRecovery(getAll.error);
          getAll.onsuccess = () => resolveRecovery(getAll.result);
        };
      }),
  );
  expect(recoveryState).toHaveLength(1);
  expect(recoveryState[0].originalUrl).toBe(originalUrl);
  const rebuiltTabId = recoveryState[0].browserTabId;
  await worker.evaluate(async (tabId) => chrome.tabs.remove(tabId), rebuiltTabId);
  await expect
    .poll(() =>
      panel.evaluate(
        () =>
          new Promise((resolveRecovery, rejectRecovery) => {
            const request = indexedDB.open("tab-vault");
            request.onerror = () => rejectRecovery(request.error);
            request.onsuccess = () => {
              const getAll = request.result
                .transaction("deepSleepRecoveries", "readonly")
                .objectStore("deepSleepRecoveries")
                .getAll();
              getAll.onerror = () => rejectRecovery(getAll.error);
              getAll.onsuccess = () => resolveRecovery(getAll.result.length);
            };
          }),
      ),
    )
    .toBe(0);

  console.log(
    JSON.stringify(
      {
        legacyEventMigrated: true,
        deepSleepTabRebuilt: true,
        originalUrlPreserved: true,
        independentRecoveryRecord: true,
        manualCloseCleanup: true,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(profileRoot, { recursive: true, force: true });
}
