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
      <rect x="4" y="4" width="120" height="120" rx="27" fill="#172534" />
      <path
        d="M28 25h61c7.7 0 14 6.3 14 14v49c0 7.7-6.3 14-14 14H28c-7.7 0-14-6.3-14-14V39c0-7.7 6.3-14 14-14Z"
        fill="#ff735f"
      />
      <path
        d="M33 32h61c7.7 0 14 6.3 14 14v49c0 7.7-6.3 14-14 14H33c-7.7 0-14-6.3-14-14V46c0-7.7 6.3-14 14-14Z"
        fill="#37c8aa"
      />
      <path
        d="M37 40h22.5c3 0 4.6 1.5 6.4 4l4.3 6H94c7.7 0 14 6.3 14 14v34c0 7.7-6.3 14-14 14H37c-7.7 0-14-6.3-14-14V54c0-7.7 6.3-14 14-14Z"
        fill="#f8fafc"
      />
      <circle cx="67" cy="81" r="22" fill="#172534" />
      <circle
        cx="67"
        cy="81"
        r="12"
        fill="none"
        stroke="#f8fafc"
        stroke-width="5"
      />
      <path
        d="M67 65v10M53.1 89l8.7-5M80.9 89l-8.7-5"
        fill="none"
        stroke="#f8fafc"
        stroke-width="4.5"
        stroke-linecap="round"
      />
      <circle cx="67" cy="81" r="4.5" fill="#37c8aa" />
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
