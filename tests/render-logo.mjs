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
      <rect x="20" y="23" width="88" height="86" rx="14" fill="#f7f9fa" />
      <path
        d="M20 52h88"
        fill="none"
        stroke="#151e27"
        stroke-width="7"
      />
      <rect x="31" y="34" width="28" height="8" rx="4" fill="#43c6aa" />
      <circle cx="64" cy="78" r="15" fill="#151e27" />
      <circle cx="64" cy="75" r="5.5" fill="#43c6aa" />
      <path d="M60 80h8l4 16H56l4-16Z" fill="#43c6aa" />
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
