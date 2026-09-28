import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const profilePath = join(
  tmpdir(),
  `tab-vault-all-resources-${Date.now().toString(36)}`,
);
const resourceCount = Number(process.env.RESOURCE_COUNT ?? 2_000);
const collectionCount = 20;

await mkdir(profilePath, { recursive: true });

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
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByText("标签资产库", { exact: true }).waitFor();

  const collections = Array.from({ length: collectionCount }, (_, index) => ({
    id: `collection_perf_${index}`,
    name: `性能分组 ${index + 1}`,
    color: index % 2 === 0 ? "blue" : "orange",
    createdAt: 1_000 + index,
    sortOrder: index,
    autoArchiveMinutes: null,
  }));
  const resources = Array.from({ length: resourceCount }, (_, index) => ({
    id: `resource_perf_${index}`,
    originalUrl: `https://example.com/report/${index}?id=${index}`,
    normalizedUrl: `https://example.com/report/${index}?id=${index}`,
    dedupeKey: `perf-${index}`,
    title: `性能测试资源 ${index + 1}`,
    domain: "example.com",
    createdAt: 10_000 + index,
    updatedAt: 10_000 + index,
    lastVisitedAt: 10_000 + index,
    visitCount: 1,
    protected: false,
    notes: "",
  }));
  const memberships = resources.map((resource, index) => {
    const collection = collections[index % collections.length];
    return {
      id: `${collection.id}:${resource.id}`,
      collectionId: collection.id,
      resourceId: resource.id,
      source: "manual",
      createdAt: 20_000 + index,
    };
  });

  const importStartedAt = performance.now();
  const importResponse = await panel.evaluate(
    async ({ resources, collections, memberships }) =>
      chrome.runtime.sendMessage({
        type: "IMPORT_DATA",
        data: {
          format: "tab-vault",
          version: 1,
          exportedAt: Date.now(),
          resources,
          collections,
          memberships,
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
          },
        },
      }),
    { resources, collections, memberships },
  );
  if (!importResponse?.ok) {
    throw new Error(importResponse?.error || "Performance fixture import failed");
  }

  await panel.getByText(`${resourceCount} 个资源`, { exact: true }).waitFor({
    timeout: 30_000,
  });
  const result = await panel.evaluate(async () => {
    const button = document.querySelector(
      '.navigation-rail button[aria-label="全部资源"]',
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("All resources navigation button not found");
    }
    const startedAt = performance.now();
    button.click();
    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    );
    return {
      durationMs: performance.now() - startedAt,
      renderedRows: document.querySelectorAll(".resource-row").length,
    };
  });
  if (result.durationMs > 200) {
    throw new Error(
      `All resources took ${result.durationMs.toFixed(1)} ms; expected <= 200 ms`,
    );
  }
  if (result.renderedRows !== Math.min(resourceCount, 80)) {
    throw new Error(
      `Expected 80 initial rows, received ${result.renderedRows}`,
    );
  }

  const progressiveRows = await panel
    .locator(".resource-list")
    .evaluate(async (list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll"));
      await new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      );
      return document.querySelectorAll(".resource-row").length;
    });
  if (progressiveRows <= result.renderedRows) {
    throw new Error("Scrolling did not append the next resource batch");
  }

  console.log(
    JSON.stringify(
      {
        resourceCount,
        collectionCount,
        importDurationMs: performance.now() - importStartedAt,
        ...result,
        progressiveRows,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
