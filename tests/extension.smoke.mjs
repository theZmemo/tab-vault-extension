import { createServer } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const artifactsPath = join(projectRoot, "artifacts");
const profilePath = join(
  tmpdir(),
  `tab-vault-smoke-${Date.now().toString(36)}`,
);

const server = createServer((request, response) => {
  const title = request.url?.startsWith("/delete")
    ? "待删除页面"
    : request.url?.startsWith("/new")
      ? "数据治理工作台"
      : "治理任务校验 SQL";
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`
    <title>${title}</title>
    <main>
      <h1>${title}</h1>
      <p>${request.url}</p>
    </main>
  `);
});

await new Promise((resolveServer) =>
  server.listen(4178, "127.0.0.1", resolveServer),
);
await mkdir(artifactsPath, { recursive: true });

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    locale: "zh-CN",
    viewport: { width: 480, height: 780 },
    env: {
      ...process.env,
      HOME: profilePath,
    },
    args: [
      "--disable-breakpad",
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

  const sourcePage = await context.newPage();
  await sourcePage.goto(
    "http://127.0.0.1:4178/report?id=42&utm_source=smoke",
  );
  await expect(sourcePage).toHaveTitle("治理任务校验 SQL");
  const duplicatePage = await context.newPage();
  await duplicatePage.goto(
    "http://127.0.0.1:4178/report?id=42&utm_source=duplicate",
  );

  const panel = await context.newPage();
  const runtimeErrors = [];
  panel.on("pageerror", (error) => runtimeErrors.push(error.message));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByText("标签资产库", { exact: true })).toBeVisible();
  await expect(panel.locator(".group-overview")).toBeVisible();
  await expect(
    panel.locator(".group-overview").getByText("暂无永久分组", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".resource-row")).toHaveCount(0);
  await expect(
    panel.locator(
      '.navigation-rail button.is-active[aria-label="永久分组"]',
    ),
  ).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "group-overview-empty.png"),
    fullPage: true,
  });

  await panel.getByLabel("搜索资源").fill("任务校验");
  await expect(panel.getByText("治理任务校验 SQL", { exact: true })).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(panel.locator(".resource-row")).toHaveCount(1);
  await expect(panel.getByText("重复 2", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("资源排序")).toBeVisible();
  await panel.getByTitle("清除搜索").click();
  await expect(panel.locator(".group-overview")).toBeVisible();

  await panel
    .locator(".navigation-rail")
    .getByLabel("全部资源", { exact: true })
    .click();
  await expect(panel.locator(".resource-row")).toHaveCount(1);
  await panel
    .locator(".navigation-rail")
    .getByLabel("永久分组", { exact: true })
    .click();
  await expect(panel.locator(".group-overview")).toBeVisible();

  await panel.locator(".top-actions").getByTitle("新建永久分组").click();
  await expect(panel.locator(".color-swatch")).toHaveCount(20);
  await panel.screenshot({
    path: join(artifactsPath, "color-picker.png"),
    fullPage: true,
  });
  await panel.getByLabel("分组名称").fill("数据治理");
  await panel.getByLabel("选择橙色").click();
  await panel.getByRole("button", { name: "创建分组" }).click();
  await panel.getByTitle("展开导航").click();
  await panel.locator(".navigation").getByTitle("编辑 数据治理").click();
  await panel.getByLabel("分组名称").fill("治理资料");
  await panel.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    panel.locator(".group-overview").getByText("治理资料", { exact: true }),
  ).toBeVisible();

  await panel.locator(".top-actions").getByTitle("新建永久分组").click();
  await panel.getByLabel("分组名称").fill("待处理");
  await panel.getByLabel("选择深蓝色").click();
  await panel.getByRole("button", { name: "创建分组" }).click();
  await expect(
    panel.locator(".group-overview").getByText("待处理", { exact: true }),
  ).toBeVisible();

  await panel.getByRole("button", { name: /规则中心/ }).click();
  await panel.getByRole("button", { name: "新建规则" }).click();
  await panel.getByLabel("规则名称").fill("本地治理页面");
  await panel.getByLabel("加入分组").selectOption({ label: "治理资料" });
  await panel.getByLabel("域名").fill("127.0.0.1");
  await panel.getByRole("button", { name: "保存规则" }).click();
  await expect(panel.getByText("本地治理页面", { exact: true })).toBeVisible();
  await panel.locator(".modal").getByTitle("关闭").click();
  await panel.getByTitle("收起导航").click();

  const newPage = await context.newPage();
  await newPage.goto("http://127.0.0.1:4178/new?id=99");
  await expect(newPage).toHaveTitle("数据治理工作台");
  await expect(
    panel.locator("main").getByText("数据治理工作台", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await panel.screenshot({
    path: join(artifactsPath, "group-overview.png"),
    fullPage: true,
  });
  const governanceRailButton = panel
    .locator(".navigation-rail")
    .getByRole("button", { name: "治理资料", exact: true });
  await governanceRailButton.hover();
  await expect(governanceRailButton.locator(".rail-tooltip")).toBeVisible();
  await expect(governanceRailButton.locator(".rail-tooltip")).toHaveText(
    "治理资料",
  );
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-rail-tooltip.png"),
    fullPage: true,
  });
  await governanceRailButton.click();
  await expect(governanceRailButton).toHaveAttribute("aria-current", "page");
  await expect(panel.locator(".resource-row")).toHaveCount(2);
  await panel
    .locator(".navigation-rail")
    .getByLabel("永久分组", { exact: true })
    .click();
  await expect(panel.locator(".group-overview")).toBeVisible();

  const groupOverview = panel.locator(".group-overview");
  const governanceHoverGroup = groupOverview
    .locator(".collection-accordion")
    .filter({ hasText: "治理资料" });
  await governanceHoverGroup.locator(".collection-accordion-header").hover();
  await panel.waitForTimeout(160);
  const hoverTransform = await governanceHoverGroup
    .locator(".collection-accordion-header")
    .evaluate((element) => getComputedStyle(element).transform);
  expect(hoverTransform).not.toBe("none");
  await panel.screenshot({
    path: join(artifactsPath, "group-hover-feedback.png"),
    fullPage: true,
  });
  await groupOverview.getByLabel("分组排序").selectOption("count");
  await expect(
    groupOverview.locator(".collection-accordion").first(),
  ).toContainText("治理资料");
  await groupOverview.getByLabel("分组排序").selectOption("manual");
  const governanceGroup = groupOverview
    .locator(".collection-accordion")
    .filter({ hasText: "治理资料" });
  const pendingGroup = groupOverview
    .locator(".collection-accordion")
    .filter({ hasText: "待处理" });
  await expect(pendingGroup).toHaveAttribute("draggable", "true");
  await pendingGroup.dragTo(governanceGroup);
  await expect(
    groupOverview.locator(".collection-accordion").first(),
  ).toContainText("待处理");

  const governanceNewResource = governanceGroup
    .locator(".collection-resource-row")
    .filter({ hasText: "数据治理工作台" });
  await governanceNewResource.getByTitle("移动或移除页面").click();
  await panel.getByRole("button", { name: "移动到待处理" }).click();
  await pendingGroup.locator(".collection-accordion-toggle").click();
  const pendingResource = pendingGroup
    .locator(".collection-resource-row")
    .filter({ hasText: "数据治理工作台" });
  await expect(pendingResource).toBeVisible();
  await pendingResource.getByTitle("移动或移除页面").click();
  await panel.getByRole("button", { name: "从待处理移除" }).click();

  await groupOverview
    .locator(".collection-accordion")
    .filter({ hasText: "治理资料" })
    .getByRole("button", { name: "查看全部" })
    .click();
  await expect(panel.locator(".resource-row")).toHaveCount(1);

  const resourceRow = panel
    .locator(".resource-row")
    .filter({ hasText: "治理任务校验 SQL" });
  await expect(resourceRow.getByText("治理资料", { exact: true })).toBeVisible();
  const compactResourceBox = await resourceRow.boundingBox();
  expect(compactResourceBox?.height).toBeLessThanOrEqual(80);

  await resourceRow.getByTitle("归档并关闭").click();
  await expect(resourceRow.getByText("已归档", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(resourceRow.locator(".status-virtual")).toHaveAttribute(
    "title",
    "浏览器标签已关闭，记录保留在资产库中，可重新打开",
  );
  await resourceRow.getByTitle("打开页面").click();
  await expect(resourceRow.getByText("已打开", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await resourceRow.getByTitle("重命名页面").click();
  await panel.getByLabel("页面名称").fill("治理 SQL · 自定义");
  await panel.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    panel.locator("main").getByText("治理 SQL · 自定义", { exact: true }),
  ).toBeVisible();
  const refreshedPage = context
    .pages()
    .find((page) => page.url().includes("/report?id=42"));
  await refreshedPage?.reload();
  await expect(
    panel.locator("main").getByText("治理 SQL · 自定义", { exact: true }),
  ).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "compact-resource-card.png"),
    fullPage: true,
  });

  await panel
    .locator(".navigation-rail")
    .getByLabel("永久分组", { exact: true })
    .click();
  await panel.getByLabel("搜索资源").fill("自定义");
  await expect(panel.locator(".resource-row")).toHaveCount(1);
  await expect(
    panel.locator(".resource-row").getByText("治理 SQL · 自定义", {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByLabel("搜索资源").fill("127.0.0.1");
  await expect(panel.locator(".resource-row")).toHaveCount(2);
  await expect(panel.locator(".resource-row").first()).toContainText(
    "治理 SQL · 自定义",
  );
  await panel.getByTitle("清除搜索").click();
  await expect(panel.locator(".group-overview")).toBeVisible();

  await panel.getByTitle("保存当前快照").click();
  await expect(panel.getByText("当前会话已保存", { exact: true })).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-smoke.png"),
    fullPage: true,
  });

  const extraGroupNames = Array.from(
    { length: 6 },
    (_, index) => `补充分组 ${index + 1}`,
  );
  await panel.evaluate(async (groupNames) => {
    for (const name of groupNames) {
      const response = await chrome.runtime.sendMessage({
        type: "CREATE_COLLECTION",
        name,
        color: "gray",
      });
      if (!response?.ok) {
        throw new Error(response?.error || `Unable to create ${name}`);
      }
    }
  }, extraGroupNames);
  const moreGroupsButton = panel
    .locator(".navigation-rail")
    .getByRole("button", { name: "还有 1 个分组", exact: true });
  await expect(moreGroupsButton).toBeVisible();
  await moreGroupsButton.click();
  await expect(panel.locator(".navigation")).toHaveClass(/is-open/);
  await expect(panel.locator(".navigation")).toContainText("补充分组 6");
  await panel.getByTitle("收起导航").click();

  await panel.setViewportSize({ width: 760, height: 780 });
  await expect(panel.locator(".navigation-rail")).toBeVisible();
  const compactRailBox = await panel.locator(".navigation-rail").boundingBox();
  expect(compactRailBox?.width).toBe(42);
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-rail.png"),
    fullPage: true,
  });
  const collapsedContentBox = await panel.locator(".content").boundingBox();
  await panel.getByTitle("展开导航").click();
  await expect(panel.locator(".navigation")).toBeVisible();
  await panel.waitForTimeout(200);
  const expandedContentBox = await panel.locator(".content").boundingBox();
  expect(expandedContentBox?.width).toBe(collapsedContentBox?.width);
  const hasHorizontalOverflow = await panel.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-wide.png"),
    fullPage: true,
  });

  const browserPanelSide = await panel.evaluate(async () => {
    if (!chrome.sidePanel.getLayout) {
      return "right";
    }
    return (await chrome.sidePanel.getLayout()).side;
  });
  await panel.getByTitle("设置").click();
  await expect(panel.getByText("图标导航轨道位置")).toHaveCount(0);
  await expect(panel.getByText("浏览器侧边栏", { exact: true })).toBeVisible();
  await expect(panel.getByText("隐私与数据", { exact: true })).toBeVisible();
  await expect(
    panel.getByText(
      "标签 URL、标题、访问时间和分组仅保存在当前浏览器中，不会对外传输。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "查看隐私政策" }),
  ).toBeVisible();
  await expect(
    panel.getByText("关于标签资产库", { exact: true }),
  ).toBeVisible();
  const aboutPagePromise = context.waitForEvent("page");
  await panel.getByRole("button", { name: "查看产品介绍" }).click();
  const aboutPage = await aboutPagePromise;
  await aboutPage.waitForLoadState();
  expect(aboutPage.url()).toBe(
    `chrome-extension://${extensionId}/about.html`,
  );
  await expect(
    aboutPage.getByRole("heading", { name: "标签资产库" }),
  ).toBeVisible();
  await expect(aboutPage.getByRole("link", { name: "访问官网" })).toHaveAttribute(
    "href",
    "https://tidr.dev/xxx",
  );
  await aboutPage.screenshot({
    path: join(artifactsPath, "about-page.png"),
    fullPage: true,
  });
  await aboutPage.close();
  await panel.getByTitle("关闭").press("Escape");
  await expect(panel.locator(".modal")).toHaveCount(0);
  await panel.getByTitle("收起导航").click();
  await expect(panel.locator(".navigation")).not.toHaveClass(/is-open/);
  await panel.waitForTimeout(220);
  await panel.setViewportSize({ width: 380, height: 780 });
  const compactRailAtBrowserSide = await panel
    .locator(".navigation-rail")
    .boundingBox();
  expect(compactRailAtBrowserSide?.width).toBe(42);
  if (browserPanelSide === "right") {
    expect(compactRailAtBrowserSide?.x).toBeGreaterThan(330);
  } else {
    expect(compactRailAtBrowserSide?.x).toBeLessThan(1);
  }
  const compactHasHorizontalOverflow = await panel.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(compactHasHorizontalOverflow).toBe(false);
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-compact-browser-side.png"),
    fullPage: true,
  });

  await serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (
        tab.id !== undefined &&
        (tab.url?.startsWith("http://") || tab.url?.startsWith("https://"))
      ) {
        await chrome.tabs.update(tab.id, { pinned: true });
      }
    }
  });
  await panel.locator(".top-actions").getByTitle("批量休眠标签").click();
  await expect(panel.getByText("选择休眠级别", { exact: true })).toBeVisible();
  await expect(panel.getByText("第 1 级 · 推荐", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("第 2 级 · 扩大范围", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("第 3 级 · 增强", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("第 4 级 · 深度休眠", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "休眠当前窗口其他标签" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "休眠所有窗口可休眠标签" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "强力休眠所有后台标签" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "深度休眠所有可操作网页标签" }),
  ).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "batch-sleep-dialog.png"),
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "休眠当前窗口其他标签" })
    .click();
  await expect(
    panel.getByText("当前窗口没有可休眠标签，可尝试第 2 级处理所有窗口。", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 10_000 });
  await panel.locator(".top-actions").getByTitle("批量休眠标签").click();
  await panel
    .getByRole("button", { name: "休眠所有窗口可休眠标签" })
    .click();
  await expect(
    panel.getByText("安全级别没有可休眠标签，可尝试第 3 级扩大覆盖。", {
      exact: true,
    }),
  ).toBeVisible();
  await panel.locator(".top-actions").getByTitle("批量休眠标签").click();
  await panel
    .getByRole("button", { name: "强力休眠所有后台标签" })
    .click();
  await expect(panel.getByText("没有可休眠的标签", { exact: true })).toBeVisible();

  const deepSleepPage = await context.newPage();
  await deepSleepPage.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
  });
  await deepSleepPage.goto("http://127.0.0.1:4178/deep-sleep?id=101");
  await expect(deepSleepPage).toHaveTitle("治理任务校验 SQL");
  const deepSleepOriginalUrl = deepSleepPage.url();
  await panel.bringToFront();
  const deepSleepTabId = await serviceWorker.evaluate(async (originalUrl) => {
    const tab = (await chrome.tabs.query({})).find(
      (candidate) => candidate.url === originalUrl,
    );
    if (tab?.id === undefined) {
      throw new Error("Deep-sleep fixture tab not found");
    }
    await chrome.tabs.update(tab.id, { pinned: true });
    return tab.id;
  }, deepSleepOriginalUrl);
  await panel.locator(".top-actions").getByTitle("批量休眠标签").click();
  await panel
    .getByRole("button", { name: "深度休眠所有可操作网页标签" })
    .click();
  await expect(
    panel.getByText("深度休眠前确认", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "活动页面会立即被替换；音频、加载任务、未提交表单和网页应用临时状态都会中断。",
      { exact: true },
    ),
  ).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "deep-sleep-warning.png"),
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "确认并开始深度休眠" })
    .click();
  await expect(
    panel.getByText(/已深度休眠 \d+ 个标签；选中时会自动恢复/),
  ).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => deepSleepPage.url())
    .toContain(`chrome-extension://${extensionId}/suspended.html`);
  await deepSleepPage.screenshot({
    path: join(artifactsPath, "deep-sleep-placeholder.png"),
    fullPage: true,
  });
  const deepSleepState = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data;
  });
  const deepSleepInstance = deepSleepState.instances.find(
    (instance) =>
      instance.browserTabId === deepSleepTabId && instance.deepSleeping,
  );
  expect(deepSleepInstance).toBeTruthy();
  expect(deepSleepState.settings.deepSleepWarningAccepted).toBe(true);
  expect(deepSleepState.settings.deepSleepWarningVersion).toBe(2);

  await panel.getByTitle("保存当前快照").click();
  await expect(panel.getByText("当前会话已保存", { exact: true })).toBeVisible();
  const snapshotState = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data;
  });
  expect(
    snapshotState.snapshots[0].tabs.some(
      (tab) => tab.url === deepSleepOriginalUrl,
    ),
  ).toBe(true);

  await serviceWorker.evaluate(async (tabId) => {
    await chrome.tabs.update(tabId, { active: true });
  }, deepSleepInstance.browserTabId);
  await expect
    .poll(() => deepSleepPage.url(), { timeout: 10_000 })
    .toBe(deepSleepOriginalUrl);
  await expect(deepSleepPage).toHaveTitle("治理任务校验 SQL");
  await panel.bringToFront();
  const restoredDeepSleepState = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data;
  });
  expect(
    restoredDeepSleepState.instances.some(
      (instance) =>
        instance.browserTabId === deepSleepInstance.browserTabId &&
        instance.deepSleeping,
    ),
  ).toBe(false);
  const restoredRecoveryCount = await panel.evaluate(
    (resourceId) =>
      new Promise((resolveRecovery, rejectRecovery) => {
        const request = indexedDB.open("tab-vault");
        request.onerror = () => rejectRecovery(request.error);
        request.onsuccess = () => {
          const recoveries = request.result
            .transaction("deepSleepRecoveries", "readonly")
            .objectStore("deepSleepRecoveries")
            .index("resourceId")
            .getAll(resourceId);
          recoveries.onerror = () => rejectRecovery(recoveries.error);
          recoveries.onsuccess = () =>
            resolveRecovery(recoveries.result.length);
        };
      }),
    deepSleepInstance.resourceId,
  );
  expect(restoredRecoveryCount).toBe(0);

  const activeDeepSleepPage = await context.newPage();
  await activeDeepSleepPage.goto(
    "http://127.0.0.1:4178/active-deep-sleep?id=102",
  );
  const activeDeepSleepUrl = activeDeepSleepPage.url();
  const activeDeepSleepResponse = await panel.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "DEEP_SLEEP_ELIGIBLE_TABS" }),
  );
  expect(activeDeepSleepResponse.ok).toBe(true);
  expect(activeDeepSleepResponse.data).toBeGreaterThan(0);
  await expect
    .poll(() => activeDeepSleepPage.url())
    .toContain(`chrome-extension://${extensionId}/suspended.html`);
  await expect(
    activeDeepSleepPage.getByRole("button", { name: "立即恢复" }),
  ).toBeVisible();
  await activeDeepSleepPage.getByRole("button", { name: "立即恢复" }).click();
  await expect
    .poll(() => activeDeepSleepPage.url(), { timeout: 10_000 })
    .toBe(activeDeepSleepUrl);
  await panel.bringToFront();
  await panel
    .locator(".navigation-rail")
    .getByLabel("全部资源", { exact: true })
    .click();

  const deletionPage = await context.newPage();
  await deletionPage.goto("http://127.0.0.1:4178/delete?id=100");
  await expect(deletionPage).toHaveTitle("待删除页面");
  await panel.getByLabel("搜索资源").fill("待删除页面");
  const deletionRow = panel
    .locator(".resource-row")
    .filter({ hasText: "待删除页面" });
  await expect(deletionRow).toBeVisible({ timeout: 10_000 });
  await panel.getByTitle("保存当前快照").click();
  const deletionResourceId = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data.resources.find(
      (resource) => resource.title === "待删除页面",
    ).id;
  });
  await deletionRow.getByTitle("归档并关闭").click();
  await expect(deletionRow.getByText("已归档", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  panel.once("dialog", (dialog) => dialog.accept());
  await deletionRow.getByTitle("永久删除").click();
  await expect(deletionRow).toHaveCount(0);
  const deletionState = await panel.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.data;
  });
  expect(
    deletionState.resources.some(
      (resource) => resource.id === deletionResourceId,
    ),
  ).toBe(false);
  expect(
    deletionState.snapshots.some((snapshot) =>
      snapshot.tabs.some((tab) => tab.resourceId === deletionResourceId),
    ),
  ).toBe(false);

  if (runtimeErrors.length > 0) {
    throw new Error(`Side panel errors: ${runtimeErrors.join("; ")}`);
  }

  console.log(
    JSON.stringify(
      {
        extensionId,
        captured: true,
        deduplicated: true,
        collection: true,
        collectionEdited: true,
        customTitlePersisted: true,
        collectionColorCount: 20,
        collectionSort: true,
        collectionMoveAndRemove: true,
        compactResourceCards: true,
        archiveMeaningExposed: true,
        compactResourceScreenshot: "artifacts/compact-resource-card.png",
        batchSleepCurrentWindow: true,
        batchSleepAllWindowsAvailable: true,
        batchSleepForceAllAvailable: true,
        batchSleepDeepAvailable: true,
        batchSleepProgressiveLevels: true,
        batchSleepScreenshot: "artifacts/batch-sleep-dialog.png",
        deepSleepWarningScreenshot: "artifacts/deep-sleep-warning.png",
        deepSleepPlaceholderScreenshot:
          "artifacts/deep-sleep-placeholder.png",
        deepSleepPlaceholder: true,
        deepSleepSnapshotOriginalUrl: true,
        deepSleepAutomaticRestore: true,
        deepSleepWakeCleanup: true,
        deepSleepActiveTab: true,
        deepSleepWarningPersisted: true,
        groupOverviewDefault: true,
        groupOverviewSearch: true,
        searchCustomTitle: true,
        searchChineseSubstring: true,
        searchPermanentFirst: true,
        additionalGroupsAccessible: true,
        collectionRailDirectOpen: true,
        groupHoverFeedback: true,
        modalEscapeClose: true,
        privacyDisclosure: true,
        packagedAboutPage: true,
        locale: "zh-CN",
        navigationFollowsBrowser: true,
        compactRail: true,
        compactWidth: 380,
        railTooltips: true,
        automaticRule: true,
        contextMenusPermission: await serviceWorker.evaluate(() =>
          chrome.runtime.getManifest().permissions?.includes("contextMenus"),
        ),
        archiveRestore: true,
        permanentDelete: true,
        snapshot: true,
        groupOverviewScreenshot: "artifacts/group-overview.png",
        screenshot: "artifacts/sidepanel-smoke.png",
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(profilePath, { recursive: true, force: true });
}
