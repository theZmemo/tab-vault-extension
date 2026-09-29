import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const artifactsPath = join(projectRoot, "artifacts");
const requestedLocale = process.env.TAB_VAULT_TEST_LOCALE ?? "en-US";
const localeKey = requestedLocale.toLowerCase().replaceAll("-", "_");
const expectations = {
  "en-US": {
    appName: "Tab Vault",
    searchPlaceholder: "Search title, URL, domain, or notes",
    noPermanentGroups: "No permanent groups",
    settings: "Settings",
    browserPanelSide: "Browser side panel",
    privacyAndData: "Privacy and data",
    localDataDisclosure:
      "Tab URLs, titles, visit times, and groups stay in this browser and are not transmitted.",
    productIntroduction: "About Tab Vault",
    viewProductIntroduction: "View introduction",
    officialWebsite: "Official website",
  },
  "ja-JP": {
    appName: "タブ保管庫",
    searchPlaceholder: "タイトル、URL、ドメイン、またはメモを検索します",
    noPermanentGroups: "永続的なグループはありません",
    settings: "設定",
    browserPanelSide: "ブラウザのサイドパネル",
    privacyAndData: "プライバシーとデータ",
    localDataDisclosure:
      "タブ URL、タイトル、訪問時間、およびグループはこのブラウザ内に留まり、送信されません。",
    productIntroduction: "タブ保管庫について",
    viewProductIntroduction: "製品紹介を見る",
    officialWebsite: "公式サイト",
  },
  "ko-KR": {
    appName: "탭 보관함",
    searchPlaceholder: "제목, URL, 도메인, 메모 검색",
    noPermanentGroups: "영구 그룹 없음",
    settings: "설정",
    browserPanelSide: "브라우저 측면 패널",
    privacyAndData: "개인정보 보호 및 데이터",
    localDataDisclosure:
      "탭 URL, 제목, 방문 시간 및 그룹은 이 브라우저에 유지되며 전송되지 않습니다.",
    productIntroduction: "탭 보관함 정보",
    viewProductIntroduction: "제품 소개 보기",
    officialWebsite: "공식 웹사이트",
  },
  "zh-TW": {
    appName: "標籤資產庫",
    searchPlaceholder: "搜尋標題、URL、網域或備註",
    noPermanentGroups: "暫無永久分組",
    settings: "設定",
    browserPanelSide: "瀏覽器側邊欄",
    privacyAndData: "隱私與資料",
    localDataDisclosure:
      "標籤 URL、標題、存取時間和分組僅保存在目前瀏覽器中，不會對外傳輸。",
    productIntroduction: "關於標籤資產庫",
    viewProductIntroduction: "查看產品介紹",
    officialWebsite: "前往官網",
  },
  "de-DE": {
    appName: "Tab Vault",
    searchPlaceholder: "Suchen Sie nach Titel, URL, Domäne oder Notizen",
    noPermanentGroups: "Keine festen Gruppen",
    settings: "Einstellungen",
    browserPanelSide: "Seitenbereich des Browsers",
    privacyAndData: "Privatsphäre und Daten",
    localDataDisclosure:
      "Tab URLs, Titel, Besuchszeiten und Gruppen bleiben in diesem Browser und werden nicht übertragen.",
    productIntroduction: "Über Tab Vault",
    viewProductIntroduction: "Produktvorstellung öffnen",
    officialWebsite: "Offizielle Website",
  },
  "fr-FR": {
    appName: "Tab Vault",
    searchPlaceholder: "Rechercher un titre, un URL, un domaine ou des notes",
    noPermanentGroups: "Pas de groupes permanents",
    settings: "Paramètres",
    browserPanelSide: "Panneau latéral du navigateur",
    privacyAndData: "Confidentialité et données",
    localDataDisclosure:
      "Les onglets URL, les titres, les heures de visite et les groupes restent dans ce navigateur et ne sont pas transmis.",
    productIntroduction: "À propos de Tab Vault",
    viewProductIntroduction: "Voir la présentation",
    officialWebsite: "Site officiel",
  },
  "ru-RU": {
    appName: "Tab Vault",
    searchPlaceholder: "Поиск по названию, URL, домену или заметкам.",
    noPermanentGroups: "Нет постоянных групп",
    settings: "Настройки",
    browserPanelSide: "Боковая панель браузера",
    privacyAndData: "Конфиденциальность и данные",
    localDataDisclosure:
      "Вкладки URL, заголовки, время посещения и группы остаются в этом браузере и не передаются.",
    productIntroduction: "О Tab Vault",
    viewProductIntroduction: "Открыть описание",
    officialWebsite: "Официальный сайт",
  },
}[requestedLocale];
if (!expectations) {
  throw new Error(`Unsupported smoke-test locale: ${requestedLocale}`);
}
const profilePath = join(
  tmpdir(),
  `tab-vault-locale-${localeKey}-${Date.now().toString(36)}`,
);

await mkdir(artifactsPath, { recursive: true });

let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    locale: requestedLocale,
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

  await expect(
    panel.getByText(expectations.appName, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByPlaceholder(expectations.searchPlaceholder),
  ).toBeVisible();
  await expect(panel.locator(".group-overview")).toBeVisible();
  await expect(
    panel.getByText(expectations.noPermanentGroups, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".navigation-rail")).toHaveCSS("width", "42px");
  await panel.screenshot({
    path: join(artifactsPath, `group-overview-${localeKey}-dark.png`),
    fullPage: true,
  });
  await panel.getByTitle(expectations.settings).click();
  await expect(panel.getByText("Navigation rail position")).toHaveCount(0);
  await expect(panel.getByText(expectations.browserPanelSide)).toBeVisible();
  await expect(
    panel.getByText(expectations.privacyAndData, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(expectations.localDataDisclosure, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(expectations.productIntroduction, { exact: true }),
  ).toBeVisible();
  const aboutPagePromise = context.waitForEvent("page");
  await panel
    .getByRole("button", { name: expectations.viewProductIntroduction })
    .click();
  const aboutPage = await aboutPagePromise;
  await aboutPage.waitForLoadState();
  await expect(
    aboutPage.getByRole("heading", { name: expectations.appName }),
  ).toBeVisible();
  await expect(
    aboutPage.getByRole("link", { name: expectations.officialWebsite }),
  ).toHaveAttribute("href", "https://tidr.dev/xxx");
  await aboutPage.close();
  await panel.screenshot({
    path: join(artifactsPath, `sidepanel-${localeKey}-dark.png`),
    fullPage: true,
  });

  if (runtimeErrors.length > 0) {
    throw new Error(`English panel errors: ${runtimeErrors.join("; ")}`);
  }

  console.log(
    JSON.stringify(
      {
        locale: requestedLocale,
        theme: "dark",
        appName: true,
        groupOverviewDefault: true,
        settings: true,
        privacyDisclosure: true,
        packagedAboutPage: true,
        groupOverviewScreenshot: `artifacts/group-overview-${localeKey}-dark.png`,
        screenshot: `artifacts/sidepanel-${localeKey}-dark.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
