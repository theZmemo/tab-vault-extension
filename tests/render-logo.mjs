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
      <rect x="4" y="4" width="120" height="120" rx="27" fill="#1d5fc4" />
      <path
        d="M27 29c0-4.4 3.6-8 8-8h24l8 8h26c4.4 0 8 3.6 8 8v13H27V29Z"
        fill="#ffffff"
      />
      <rect x="27" y="54" width="74" height="13" rx="5" fill="#d9e8ff" />
      <rect x="27" y="71" width="74" height="11" rx="5" fill="#a8c8f6" />
      <path
        d="M29 76 64 104 99 76"
        fill="none"
        stroke="#58d5be"
        stroke-width="10"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="64" cy="86" r="5" fill="#ffffff" />
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
