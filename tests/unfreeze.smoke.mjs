import { createServer } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const extensionPath = resolve(import.meta.dirname, "../dist");
const profilePath = await mkdtemp(join(tmpdir(), "tab-vault-unfreeze-"));
const artifactsPath = process.env.TAB_VAULT_ARTIFACTS ?? join(tmpdir(), "tab-vault-unfreeze-artifacts");
await mkdir(artifactsPath, { recursive: true });
const requests = new Map();
const server = createServer((request, response) => {
  requests.set(request.url, (requests.get(request.url) ?? 0) + 1);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<title>Unfreeze ${request.url}</title><h1>Unfreeze ${request.url}</h1>`);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    executablePath: process.env.TAB_VAULT_TEST_CHROMIUM,
    headless: process.env.TAB_VAULT_TEST_HEADED !== "1",
    locale: "zh-CN",
    viewport: { width: 390, height: 844 },
    args: [
      "--disable-breakpad",
      "--disable-crash-reporter",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let worker = context.serviceWorkers().find((item) => item.url().startsWith("chrome-extension://"));
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole("heading", { name: "标签资产库" })).toBeVisible();
  async function command(value) {
    const response = await panel.evaluate((message) => chrome.runtime.sendMessage(message), value);
    expect(response.ok, JSON.stringify(response)).toBe(true);
    return response.data;
  }
  const state = () => command({ type: "GET_STATE" });
  async function fixture(path) {
    const page = await context.newPage();
    await page.goto(`${baseUrl}${path}`);
    await command({ type: "REFRESH_TABS" });
    const resource = (await state()).resources.find((item) => item.originalUrl === `${baseUrl}${path}`);
    expect(resource).toBeTruthy();
    const tab = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((item) => item.url === url), `${baseUrl}${path}`);
    return { page, resourceId: resource.id, tabId: tab.id, path };
  }
  async function hasSleeping(fixture) {
    return (await state()).instances.some((item) =>
      item.browserTabId === fixture.tabId && (item.deepSleeping || item.discarded));
  }
  const one = await fixture("/single");
  const duplicate = await fixture("/single");
  const deep = await fixture("/deep");
  const archived = await fixture("/archived");
  await command({ type: "ARCHIVE_RESOURCES", resourceIds: [archived.resourceId] });
  await command({ type: "DEEP_SLEEP_ELIGIBLE_TABS" });
  const live = await fixture("/live");

  // Repeated selection and refresh of a placeholder must never request the site.
  const beforeSelection = requests.get("/deep");
  const placeholder = deep.page.url();
  await worker.evaluate((tabId) => chrome.tabs.update(tabId, { active: true }), deep.tabId);
  await deep.page.reload();
  await expect(deep.page.getByRole("button", { name: "确认恢复" })).toBeVisible();
  await command({ type: "REFRESH_TABS" });
  expect(deep.page.url()).toBe(placeholder);
  expect(requests.get("/deep")).toBe(beforeSelection);
  expect(await hasSleeping(deep)).toBe(true);
  await panel.bringToFront();
  await panel.locator(".navigation-rail").getByLabel("全部资源", { exact: true }).click();
  const singleRow = panel.locator(".resource-row").filter({ hasText: "Unfreeze /single" });
  await expect(singleRow.getByRole("button", { name: "解冻标签" })).toBeVisible();
  const beforeSingle = requests.get("/single");
  await singleRow.getByRole("button", { name: "解冻标签" }).click();
  await one.page.waitForURL(`${baseUrl}/single`);
  await duplicate.page.waitForURL(`${baseUrl}/single`);
  await expect(panel.getByText("已解冻 2 个标签", { exact: true })).toBeVisible();
  await expect.poll(() => requests.get("/single")).toBe(beforeSingle + 2);
  await expect.poll(() => hasSleeping(one)).toBe(false);
  expect(await hasSleeping(duplicate)).toBe(false);

  const beforeMetadata = await worker.evaluate(async (ids) => {
    const groupId = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(groupId, { title: "Unfreeze Group", color: "cyan" });
    return Promise.all(ids.map(async (id) => {
      const tab = await chrome.tabs.get(id);
      return { id, groupId, windowId: tab.windowId, index: tab.index, pinned: tab.pinned };
    }));
  }, [deep.tabId]);
  const beforeLive = requests.get("/live");
  const beforeArchived = requests.get("/archived");
  const beforeDeep = requests.get("/deep");
  const beforeTabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.id).sort());
  for (const path of ["/deep", "/live", "/archived"]) {
    await panel.locator(".resource-row").filter({ hasText: `Unfreeze ${path}` }).getByRole("checkbox").check();
  }
  await expect(panel.locator(".action-dock").getByRole("button", { name: "解冻", exact: true })).toBeVisible();
  await panel.screenshot({ path: join(artifactsPath, "unfreeze-selection.png") });
  await panel.locator(".action-dock").getByRole("button", { name: "解冻", exact: true }).click();
  await expect(panel.getByText("已解冻 1 个标签", { exact: true })).toBeVisible();
  await deep.page.waitForURL(`${baseUrl}/deep`);
  await expect.poll(() => hasSleeping(deep)).toBe(false);
  expect(requests.get("/deep")).toBe(beforeDeep + 1);
  expect(requests.get("/live")).toBe(beforeLive);
  expect(requests.get("/archived")).toBe(beforeArchived);
  const afterMetadata = await worker.evaluate((ids) => Promise.all(ids.map(async (id) => {
    const tab = await chrome.tabs.get(id);
    return { id, groupId: tab.groupId, windowId: tab.windowId, index: tab.index, pinned: tab.pinned };
  })), [deep.tabId]);
  expect(afterMetadata).toEqual(beforeMetadata);
  expect(await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.id).sort())).toEqual(beforeTabs);
  const recoveries = await panel.evaluate(() => new Promise((done, reject) => {
    const request = indexedDB.open("tab-vault");
    request.onsuccess = () => {
      const db = request.result;
      const query = db.transaction("deepSleepRecoveries").objectStore("deepSleepRecoveries").getAll();
      query.onsuccess = () => { done(query.result); db.close(); };
      query.onerror = () => reject(query.error);
    };
    request.onerror = () => reject(request.error);
  }));
  expect(recoveries.filter((item) => [one.tabId, duplicate.tabId, deep.tabId].includes(item.browserTabId))).toEqual([]);

  // Concurrent batches share the per-tab guard and keep pinned tabs in place.
  await worker.evaluate((id) => chrome.tabs.update(id, { pinned: true }), deep.tabId);
  await command({ type: "DEEP_SLEEP_ELIGIBLE_TABS" });
  await deep.page.waitForURL((url) => url.protocol === "chrome-extension:");
  const beforeConcurrent = requests.get("/deep");
  const responses = await panel.evaluate((resourceId) => Promise.all(
    Array.from({ length: 4 }, () => chrome.runtime.sendMessage({ type: "WAKE_RESOURCES", resourceIds: [resourceId, resourceId] })),
  ), deep.resourceId);
  expect(responses.every((item) => item.ok)).toBe(true);
  expect(responses.reduce((sum, item) => sum + item.data.woken, 0)).toBe(1);
  await deep.page.waitForURL(`${baseUrl}/deep`);
  expect(requests.get("/deep")).toBe(beforeConcurrent + 1);
  expect(await worker.evaluate(async (id) => (await chrome.tabs.get(id)).pinned, deep.tabId)).toBe(true);
  expect(await command({ type: "WAKE_RESOURCES", resourceIds: [deep.resourceId, archived.resourceId] })).toEqual({ woken: 0, failed: 0 });
  console.log(JSON.stringify({
    selectionKeepsDeepSleep: true,
    singleUnfreezesAllInstances: true,
    batchWakesDeepSleep: true,
    activeAndArchivedSkipped: true,
    originalTabIdsAndGroupsPreserved: true,
    recoveryRecordsCleaned: true,
    concurrentWakeDeduplicated: true,
    pinnedTabPreserved: true,
    screenshot: join(artifactsPath, "unfreeze-selection.png"),
  }, null, 2));
} finally {
  await context?.close();
  await new Promise((done) => server.close(done));
  await rm(profilePath, { recursive: true, force: true });
}
