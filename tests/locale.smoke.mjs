import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const artifactsPath = join(projectRoot, "artifacts");
const profilePath = join(
  tmpdir(),
  `tab-vault-locale-${Date.now().toString(36)}`,
);

await mkdir(artifactsPath, { recursive: true });

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    colorScheme: "dark",
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
  const runtimeErrors = [];
  panel.on("pageerror", (error) => runtimeErrors.push(error.message));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await expect(panel.getByText("Tab Vault", { exact: true })).toBeVisible();
  await expect(
    panel.getByPlaceholder("Search title, URL, domain, or notes"),
  ).toBeVisible();
  await expect(panel.locator(".group-overview")).toBeVisible();
  await expect(
    panel.getByText("No permanent groups", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".navigation-rail")).toHaveCSS("width", "42px");
  await panel.screenshot({
    path: join(artifactsPath, "group-overview-en-dark.png"),
    fullPage: true,
  });
  await panel.getByTitle("Settings").click();
  await expect(panel.getByText("Navigation rail position")).toHaveCount(0);
  await expect(panel.getByText("Browser side panel")).toBeVisible();
  await panel.screenshot({
    path: join(artifactsPath, "sidepanel-en-dark.png"),
    fullPage: true,
  });

  if (runtimeErrors.length > 0) {
    throw new Error(`English panel errors: ${runtimeErrors.join("; ")}`);
  }

  console.log(
    JSON.stringify(
      {
        locale: "en-US",
        theme: "dark",
        appName: true,
        groupOverviewDefault: true,
        settings: true,
        groupOverviewScreenshot: "artifacts/group-overview-en-dark.png",
        screenshot: "artifacts/sidepanel-en-dark.png",
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
