import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const iconPath = join(projectRoot, "public", "icons");
const sourcePath = join(iconPath, "icon-source.png");

await mkdir(iconPath, { recursive: true });

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-breakpad", "--disable-crash-reporter"],
  });
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 4,
  });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 256px;
        height: 256px;
        margin: 0;
        display: grid;
        place-items: center;
        background: transparent;
      }
      #logo {
        width: 128px;
        height: 128px;
      }
    </style>
    <svg
      id="logo"
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Tab Vault"
    >
      <rect x="4" y="4" width="120" height="120" rx="27" fill="#151e27" />
      <path
        d="M26 34c0-6 5-11 11-11h54c6 0 11 5 11 11v17H26V34Z"
        fill="#f7f9fa"
      />
      <path
        d="M26 60h76v34c0 6-5 11-11 11H37c-6 0-11-5-11-11V60Z"
        fill="#f7f9fa"
        opacity="0.9"
      />
      <path
        d="M49 73 64 88 79 73"
        fill="none"
        stroke="#43c6aa"
        stroke-width="10"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `);
  await page.locator("#logo").screenshot({
    path: sourcePath,
    omitBackground: true,
  });

  for (const size of [16, 32, 48, 128]) {
    await execFileAsync("sips", [
      "-z",
      String(size),
      String(size),
      sourcePath,
      "--out",
      join(iconPath, `icon-${size}.png`),
    ]);
  }
} finally {
  await browser?.close();
  await rm(sourcePath, { force: true });
}
