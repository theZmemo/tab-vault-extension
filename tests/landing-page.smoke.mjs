import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const landingPath = resolve(projectRoot, "site", "xxx", "index.html");
const artifactsRoot = resolve(projectRoot, "artifacts");
const landingUrl = pathToFileURL(landingPath).href;

await mkdir(artifactsRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-breakpad", "--disable-crash-reporter"],
});

const results = [];
try {
  for (const scenario of [
    {
      name: "desktop",
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    },
    {
      name: "mobile",
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
    },
  ]) {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.emulateMedia({ colorScheme: scenario.colorScheme });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    await page.goto(landingUrl);
    await expect(page.getByRole("heading", { name: "Tab Vault" })).toBeVisible();
    await expect(page.getByRole("link", { name: "获取最新版" })).toHaveAttribute(
      "href",
      "https://github.com/theZmemo/tab-vault-extension/releases/latest",
    );

    const layout = await page.evaluate(() => {
      const hero = document.querySelector(".hero");
      const supportBand = document.querySelector(".support-band");
      const textContainers = [
        ...document.querySelectorAll(
          "h1, h2, h3, a, button, .signal-item strong, .privacy-list strong",
        ),
      ];
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        nextSectionTop: supportBand?.getBoundingClientRect().top ?? Infinity,
        productImageLoaded:
          document.querySelector(".product-visual img")?.naturalWidth === 480,
        overflowingText: textContainers
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent?.trim()),
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.nextSectionTop).toBeLessThan(scenario.viewport.height);
    expect(layout.documentHeight).toBeLessThan(3_200);
    expect(layout.productImageLoaded).toBe(true);
    expect(layout.overflowingText).toEqual([]);
    expect(errors).toEqual([]);

    if (scenario.name === "desktop") {
      await page.getByRole("heading", { name: "只做标签管理" }).scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("heading", { name: "只做标签管理" }),
      ).toBeVisible();
    }

    const screenshot = resolve(
      artifactsRoot,
      `landing-${scenario.name}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({
      viewport: scenario.viewport,
      colorScheme: scenario.colorScheme,
      nextSectionVisible: true,
      horizontalOverflow: false,
      screenshot: `artifacts/landing-${scenario.name}.png`,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ landingPage: true, results }, null, 2));
