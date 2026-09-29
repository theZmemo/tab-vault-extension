import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const distRoot = join(projectRoot, "dist");
const expectedPermissions = [
  "alarms",
  "contextMenus",
  "sidePanel",
  "tabGroups",
  "tabs",
  "unlimitedStorage",
];
const expectedIcons = new Map([
  ["16", 16],
  ["32", 32],
  ["48", 48],
  ["128", 128],
]);
const expectedLocales = [
  "de",
  "en",
  "es",
  "fr",
  "ja",
  "ko",
  "pt_BR",
  "ru",
  "zh_CN",
  "zh_TW",
];
const expectedStoreAssets = new Map([
  ["store-assets/screenshot-groups-1280x800.png", [1280, 800]],
  ["store-assets/screenshot-sleep-1280x800.png", [1280, 800]],
  ["store-assets/small-promo-440x280.png", [440, 280]],
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function readPngDimensions(path) {
  const data = await readFile(path);
  assert(
    data.subarray(1, 4).toString("ascii") === "PNG",
    `${relative(projectRoot, path)} is not a PNG file`,
  );
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

const [manifest, packageJson, localeMessages] = await Promise.all([
  readJson(join(distRoot, "manifest.json")),
  readJson(join(projectRoot, "package.json")),
  Promise.all(
    expectedLocales.map((locale) =>
      readJson(join(distRoot, "_locales", locale, "messages.json")),
    ),
  ),
]);

assert(manifest.manifest_version === 3, "Manifest V3 is required");
assert(
  manifest.version === packageJson.version,
  "Manifest and package versions must match",
);
assert(
  Number(manifest.minimum_chrome_version) >= 121,
  "Chrome 121+ is required because automatic sleep uses tabs.lastAccessed",
);
assert(
  manifest.homepage_url ===
    "https://thezmemo.github.io/tab-vault-extension/xxx/",
  "Manifest homepage must point to the current product introduction page",
);
assert(
  manifest.incognito === "not_allowed",
  "Incognito access must remain disabled",
);
assert(
  !manifest.host_permissions || manifest.host_permissions.length === 0,
  "The release must not request host permissions",
);
assert(
  JSON.stringify([...manifest.permissions].sort()) ===
    JSON.stringify([...expectedPermissions].sort()),
  `Unexpected permissions: ${JSON.stringify(manifest.permissions)}`,
);
assert(
  manifest.content_security_policy?.extension_pages ===
    "default-src 'self'; object-src 'self'",
  "The extension page CSP must only allow packaged resources",
);

for (const [size, pixels] of expectedIcons) {
  const iconPath = manifest.icons?.[size];
  assert(iconPath, `Missing ${size}px icon declaration`);
  const dimensions = await readPngDimensions(join(distRoot, iconPath));
  assert(
    dimensions.width === pixels && dimensions.height === pixels,
    `${iconPath} must be ${pixels}x${pixels}`,
  );
}

for (const [assetPath, [width, height]] of expectedStoreAssets) {
  const dimensions = await readPngDimensions(join(projectRoot, assetPath));
  assert(
    dimensions.width === width && dimensions.height === height,
    `${assetPath} must be ${width}x${height}`,
  );
}

const privacyPolicy = await readFile(
  join(projectRoot, "PRIVACY.md"),
  "utf8",
);
assert(
  /Chrome Web\s+Store User Data Policy/.test(privacyPolicy) &&
    /Limited Use requirements/.test(privacyPolicy),
  "Privacy policy must include the Chrome Web Store Limited Use statement",
);

for (const messages of localeMessages) {
  const description = messages.appDescription?.message;
  assert(
    typeof description === "string" &&
      [...description].length > 0 &&
      [...description].length <= 132,
    "Localized manifest descriptions must contain 1-132 characters",
  );
}

const distFiles = await listFiles(distRoot);
const disallowedFiles = distFiles.filter((path) =>
  /\.(map|ts|tsx|md|log)$/i.test(path),
);
assert(
  disallowedFiles.length === 0,
  `Release contains source/debug files: ${disallowedFiles
    .map((path) => relative(distRoot, path))
    .join(", ")}`,
);

const textFiles = distFiles.filter((path) =>
  /\.(js|html|css|json)$/i.test(path),
);
const forbiddenPatterns = [
  ["localhost debug endpoint", /127\.0\.0\.1:7777/],
  ["debug instrumentation", /debug-point/],
  ["source map reference", /sourceMappingURL=/],
  ["dynamic eval", /\beval\s*\(/],
  ["dynamic Function constructor", /\bnew\s+Function\s*\(/],
  ["remote script", /<script[^>]+src=["']https?:\/\//i],
];

for (const path of textFiles) {
  const content = await readFile(path, "utf8");
  for (const [label, pattern] of forbiddenPatterns) {
    assert(
      !pattern.test(content),
      `${relative(distRoot, path)} contains ${label}`,
    );
  }
}

const totalBytes = (
  await Promise.all(distFiles.map(async (path) => (await stat(path)).size))
).reduce((sum, size) => sum + size, 0);

console.log(
  JSON.stringify(
    {
      ready: true,
      version: manifest.version,
      files: distFiles.length,
      bytes: totalBytes,
      permissions: manifest.permissions,
      hostPermissions: [],
      remoteCode: false,
      incognito: manifest.incognito,
      storeAssets: expectedStoreAssets.size,
      locales: expectedLocales,
      privacyPolicy: true,
    },
    null,
    2,
  ),
);
