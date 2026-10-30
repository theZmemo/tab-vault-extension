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
    async ({ resource, resourceId, targetUrl, title }) => {
      const database = await new Promise((resolveDatabase, rejectDatabase) => {
        const request = indexedDB.open("tab-vault");
        request.onerror = () => rejectDatabase(request.error);
        request.onsuccess = () => resolveDatabase(request.result);
      });
      const transaction = database.transaction(
        [
          "resources",
          "events",
          "settings",
          "snapshots",
          "deepSleepRecoveries",
        ],
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
        savedTitleMigrationVersion: 0,
      });
      transaction.objectStore("resources").put({
        ...resource,
        title: "飞书云文档",
        savedTitle: undefined,
        savedTitleAt: undefined,
      });
      const titleBase = Date.now() + 1_000;
      transaction.objectStore("events").add({
        type: "TAB_CAPTURED",
        resourceId,
        browserTabId: 987_654_321,
        payload: { title },
        createdAt: titleBase,
      });
      transaction.objectStore("events").add({
        type: "ARCHIVE_PREPARED",
        resourceId,
        browserTabId: 987_654_321,
        createdAt: titleBase + 100,
      });
      transaction.objectStore("events").add({
        type: "TAB_CAPTURED",
        resourceId,
        browserTabId: 987_654_321,
        payload: { title: "飞书云文档" },
        createdAt: titleBase + 200,
      });
      transaction.objectStore("deepSleepRecoveries").clear();
      transaction.objectStore("events").add({
        type: "TAB_DEEP_SLEEP_COMMITTED",
        resourceId,
        browserTabId: 987_654_321,
        payload: { originalUrl: targetUrl, title },
        createdAt: Date.now(),
      });
      transaction.objectStore("snapshots").put({
        id: "snapshot_reload_recovery",
        type: "manual",
        createdAt: Date.now() - 1_000,
        checksum: "reload-recovery",
        tabs: [
          {
            resourceId,
            url: targetUrl,
            title,
            windowKey: "123456",
            index: 2,
            pinned: false,
            active: false,
            groupKey: "123456:77",
            groupTitle: "Recovery Group",
            groupColor: "cyan",
            groupCollapsed: true,
          },
        ],
      });
      await new Promise((resolveTransaction, rejectTransaction) => {
        transaction.oncomplete = resolveTransaction;
        transaction.onerror = () => rejectTransaction(transaction.error);
      });
      database.close();
    },
    {
      resource: capturedResource,
      resourceId: capturedResource.id,
      targetUrl: originalUrl,
      title: capturedResource.title,
    },
  );

  const refreshResponses = await panel.evaluate(async () =>
    Promise.all(
      Array.from({ length: 4 }, () =>
        chrome.runtime.sendMessage({ type: "REFRESH_TABS" }),
      ),
    ),
  );
  expect(refreshResponses.every((response) => response.ok)).toBe(true);
  const migratedTitle = await panel.evaluate(async (resourceId) => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    const resource = response.data.resources.find(
      (item) => item.id === resourceId,
    );
    return {
      latestTitle: resource?.title,
      savedTitle: resource?.savedTitle,
    };
  }, capturedResource.id);
  expect(migratedTitle).toEqual({
    latestTitle: "飞书云文档",
    savedTitle: capturedResource.title,
  });
  await expect
    .poll(
      () =>
        worker.evaluate(async (targetUrl) => {
          const tabs = await chrome.tabs.query({});
          return tabs.filter((candidate) => {
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
          }).length;
        }, originalUrl),
      { timeout: 15_000 },
    )
    .toBe(1);

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
  expect(recoveryState[0]).toMatchObject({
    groupKey: "123456:77",
    groupTitle: "Recovery Group",
    groupColor: "cyan",
    groupCollapsed: true,
  });
  const rebuiltTabId = recoveryState[0].browserTabId;
  const restoredGroup = await worker.evaluate(async (tabId) => {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      return null;
    }
    const group = await chrome.tabGroups.get(tab.groupId);
    return {
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
    };
  }, rebuiltTabId);
  expect(restoredGroup).toEqual({
    title: "Recovery Group",
    color: "cyan",
    collapsed: true,
  });
  await worker.evaluate(async (tabId) => {
    const tab = await chrome.tabs.get(tabId);
    await Promise.all([
      chrome.tabs.create({
        windowId: tab.windowId,
        url: tab.url,
        active: false,
      }),
      chrome.tabs.create({
        windowId: tab.windowId,
        url: tab.url,
        active: false,
      }),
    ]);
  }, rebuiltTabId);
  const cleanupResponse = await panel.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "REFRESH_TABS" }),
  );
  expect(cleanupResponse.ok).toBe(true);
  await expect
    .poll(() =>
      worker.evaluate(async (targetUrl) => {
        const tabs = await chrome.tabs.query({});
        return tabs.filter((candidate) => {
          try {
            const url = new URL(candidate.url ?? "");
            const payload = JSON.parse(decodeURIComponent(url.hash.slice(1)));
            return (
              url.pathname.endsWith("/suspended.html") &&
              payload.url === targetUrl
            );
          } catch {
            return false;
          }
        }).length;
      }, originalUrl),
    )
    .toBe(0);
  const currentRecoveryTabId = await panel.evaluate(
    (resourceId) =>
      new Promise((resolveRecovery, rejectRecovery) => {
        const request = indexedDB.open("tab-vault");
        request.onerror = () => rejectRecovery(request.error);
        request.onsuccess = () => {
          const query = request.result
            .transaction("deepSleepRecoveries", "readonly")
            .objectStore("deepSleepRecoveries")
            .index("resourceId")
            .get(resourceId);
          query.onerror = () => rejectRecovery(query.error);
          query.onsuccess = () =>
            resolveRecovery(query.result?.browserTabId);
        };
      }),
    capturedResource.id,
  );
  expect(currentRecoveryTabId).toEqual(expect.any(Number));
  await worker.evaluate(
    async (tabId) => chrome.tabs.remove(tabId),
    currentRecoveryTabId,
  );
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
        nativeTabGroupRestored: true,
        concurrentRefreshDeduplicated: true,
        staleDuplicateCleanup: true,
        manualCloseCleanup: true,
        savedTitleMigrated: true,
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
