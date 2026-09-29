import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = join(projectRoot, "dist");
const artifactsPath = join(projectRoot, "artifacts");
const requestedLocale = process.env.TAB_VAULT_TEST_LOCALE ?? "en-US";
const requestedTheme = process.env.TAB_VAULT_TEST_THEME ?? "dark";
const localeKey = requestedLocale.toLowerCase().replaceAll("-", "_");
if (!["light", "dark"].includes(requestedTheme)) {
  throw new Error(`Unsupported smoke-test theme: ${requestedTheme}`);
}
const expectations = {
  "zh-CN": {
    appName: "标签资产库",
    searchPlaceholder: "搜索标题、URL、域名或备注",
    noPermanentGroups: "暂无永久分组",
    settings: "设置",
    browserPanelSide: "浏览器侧边栏",
    privacyAndData: "隐私与数据",
    localDataDisclosure:
      "标签 URL、标题、访问时间和分组仅保存在当前浏览器中，不会对外传输。",
    productIntroduction: "关于标签资产库",
    viewProductIntroduction: "查看产品介绍",
    officialWebsite: "访问官网",
  },
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
  "es-ES": {
    appName: "Tab Vault",
    searchPlaceholder: "Buscar título, URL, dominio o notas",
    noPermanentGroups: "Sin grupos permanentes",
    settings: "Configuración",
    browserPanelSide: "Panel lateral del navegador",
    privacyAndData: "Privacidad y datos",
    localDataDisclosure:
      "Las pestañas URL, títulos, tiempos de visita y grupos permanecen en este navegador y no se transmiten.",
    productIntroduction: "Acerca de Tab Vault",
    viewProductIntroduction: "Ver presentación",
    officialWebsite: "Sitio web oficial",
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
  "pt-BR": {
    appName: "Tab Vault",
    searchPlaceholder: "Título de pesquisa, URL, domínio ou notas",
    noPermanentGroups: "Nenhum grupo permanente",
    settings: "Configurações",
    browserPanelSide: "Painel lateral do navegador",
    privacyAndData: "Privacidade e dados",
    localDataDisclosure:
      "Guia URLs, títulos, horários de visita e grupos permanecem neste navegador e não são transmitidos.",
    productIntroduction: "Sobre o Tab Vault",
    viewProductIntroduction: "Ver apresentação",
    officialWebsite: "Site oficial",
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
    colorScheme: requestedTheme,
    viewport: { width: 390, height: 844 },
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
    path: join(
      artifactsPath,
      `group-overview-${localeKey}-${requestedTheme}.png`,
    ),
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
  const settingsLayout = await panel.evaluate(() => {
    const modal = document.querySelector(".modal");
    const actions = document.querySelector(".form-actions");
    const buttons = [...document.querySelectorAll(
      ".browser-side-setting > .button-secondary",
    )];
    const lastSettingButton = buttons.at(-1);
    const actionsRect = actions?.getBoundingClientRect();
    const lastButtonRect = lastSettingButton?.getBoundingClientRect();
    return {
      modalOverflow: Boolean(
        modal && modal.scrollWidth > modal.clientWidth + 1,
      ),
      buttonOverflow: buttons.some(
        (button) => button.scrollWidth > button.clientWidth + 1,
      ),
      wrappedButtons: buttons.some(
        (button) => getComputedStyle(button).whiteSpace !== "nowrap",
      ),
      footerOverlap: Boolean(
        actionsRect &&
          lastButtonRect &&
          lastButtonRect.bottom > actionsRect.top + 1,
      ),
    };
  });
  expect(settingsLayout).toEqual({
    modalOverflow: false,
    buttonOverflow: false,
    wrappedButtons: false,
    footerOverlap: false,
  });
  await panel.locator(".form").evaluate((form) => {
    form.scrollTop = 0;
  });
  await panel.screenshot({
    path: join(
      artifactsPath,
      `sidepanel-${localeKey}-${requestedTheme}.png`,
    ),
    fullPage: true,
  });
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
  expect(
    await aboutPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await aboutPage.screenshot({
    path: join(artifactsPath, `about-${localeKey}-${requestedTheme}.png`),
    fullPage: true,
  });
  await aboutPage.close();

  if (runtimeErrors.length > 0) {
    throw new Error(`English panel errors: ${runtimeErrors.join("; ")}`);
  }

  console.log(
    JSON.stringify(
      {
        locale: requestedLocale,
        theme: requestedTheme,
        appName: true,
        groupOverviewDefault: true,
        settings: true,
        privacyDisclosure: true,
        packagedAboutPage: true,
        groupOverviewScreenshot: `artifacts/group-overview-${localeKey}-${requestedTheme}.png`,
        screenshot: `artifacts/sidepanel-${localeKey}-${requestedTheme}.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
