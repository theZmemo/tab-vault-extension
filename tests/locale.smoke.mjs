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
    deepSleepPageState: "原页面仍在休眠，确认后才会恢复",
    deepSleepPageRestore: "确认恢复",
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
    deepSleepPageState:
      "The original page remains asleep until you confirm restoration",
    deepSleepPageRestore: "Confirm restore",
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
    deepSleepPageState:
      "復元を確認するまで、元のページはディープスリープのままです",
    deepSleepPageRestore: "復元を確認",
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
    deepSleepPageState:
      "복원을 확인할 때까지 원래 페이지는 딥 슬립 상태로 유지됩니다",
    deepSleepPageRestore: "복원 확인",
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
    deepSleepPageState: "原頁面仍在休眠，確認後才會恢復",
    deepSleepPageRestore: "確認恢復",
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
    deepSleepPageState:
      "Die ursprüngliche Seite bleibt im Tiefschlaf, bis Sie die Wiederherstellung bestätigen",
    deepSleepPageRestore: "Wiederherstellung bestätigen",
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
    deepSleepPageState:
      "La página original seguirá suspendida hasta que confirmes la restauración",
    deepSleepPageRestore: "Confirmar restauración",
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
    deepSleepPageState:
      "La page d'origine reste en veille jusqu'à la confirmation de sa restauration",
    deepSleepPageRestore: "Confirmer la restauration",
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
    deepSleepPageState:
      "A página original continuará suspensa até você confirmar a restauração",
    deepSleepPageRestore: "Confirmar restauração",
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
    deepSleepPageState:
      "Исходная страница останется в глубоком сне, пока вы не подтвердите восстановление",
    deepSleepPageRestore: "Подтвердить восстановление",
  },
}[requestedLocale];
if (!expectations) {
  throw new Error(`Unsupported smoke-test locale: ${requestedLocale}`);
}
const profilePath = join(
  tmpdir(),
  `tab-vault-locale-${localeKey}-${Date.now().toString(36)}`,
);

async function readToggleGeometry(page) {
  return page.locator(".toggle").evaluate((toggle) => {
    const knob = toggle.querySelector(":scope > span");
    if (!knob) {
      return null;
    }
    const toggleRect = toggle.getBoundingClientRect();
    const knobRect = knob.getBoundingClientRect();
    return {
      checked: toggle.getAttribute("aria-checked") === "true",
      trackWidth: toggleRect.width,
      trackHeight: toggleRect.height,
      knobWidth: knobRect.width,
      knobHeight: knobRect.height,
      topInset: knobRect.top - toggleRect.top,
      rightInset: toggleRect.right - knobRect.right,
      bottomInset: toggleRect.bottom - knobRect.bottom,
      leftInset: knobRect.left - toggleRect.left,
      verticalCenterOffset:
        knobRect.top +
        knobRect.height / 2 -
        (toggleRect.top + toggleRect.height / 2),
    };
  });
}

function expectToggleGeometry(geometry, checked) {
  expect(geometry).not.toBeNull();
  expect(geometry.checked).toBe(checked);
  expect(geometry.trackWidth).toBe(36);
  expect(geometry.trackHeight).toBe(20);
  expect(geometry.knobWidth).toBe(16);
  expect(geometry.knobHeight).toBe(16);
  expect(geometry.topInset).toBe(2);
  expect(geometry.bottomInset).toBe(2);
  expect(geometry.verticalCenterOffset).toBe(0);
  expect(checked ? geometry.rightInset : geometry.leftInset).toBe(2);
}

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
      "--disable-crashpad",
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
    const topActionButtons = [
      ...document.querySelectorAll(".top-actions .icon-button"),
    ];
    const visibleIconButtons = [
      ...document.querySelectorAll(".icon-button"),
    ].filter((button) => button.getClientRects().length > 0);
    const toggle = document.querySelector(".toggle");
    const toggleKnob = toggle?.querySelector("span");
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
      missingSettingIcons: buttons.some(
        (button) =>
          button.querySelectorAll(".setting-action-icon > svg").length !== 1 ||
          button.querySelectorAll(".setting-action-label").length !== 1,
      ),
      invalidSettingIcons: buttons.some((button) => {
        const icon = button.querySelector(".setting-action-icon > svg");
        const label = button.querySelector(".setting-action-label");
        if (!icon || !label) {
          return true;
        }
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return (
          Math.abs(iconRect.width - 14) > 0.5 ||
          Math.abs(iconRect.height - 14) > 0.5 ||
          Math.abs(
            iconRect.top +
              iconRect.height / 2 -
              (buttonRect.top + buttonRect.height / 2),
          ) > 1 ||
          iconRect.right + 4 > labelRect.left
        );
      }),
      invalidTopActionIcons: topActionButtons.some((button) => {
        const icons = button.querySelectorAll("svg");
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icons[0]?.getBoundingClientRect();
        return (
          icons.length !== 1 ||
          !iconRect ||
          Math.abs(
            iconRect.left +
              iconRect.width / 2 -
              (buttonRect.left + buttonRect.width / 2),
          ) > 1 ||
          Math.abs(
            iconRect.top +
              iconRect.height / 2 -
              (buttonRect.top + buttonRect.height / 2),
          ) > 1
        );
      }),
      invalidVisibleIconButtons: visibleIconButtons.some((button) => {
        const icons = button.querySelectorAll("svg");
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icons[0]?.getBoundingClientRect();
        return (
          icons.length !== 1 ||
          !iconRect ||
          iconRect.left < buttonRect.left ||
          iconRect.right > buttonRect.right ||
          iconRect.top < buttonRect.top ||
          iconRect.bottom > buttonRect.bottom ||
          Math.abs(
            iconRect.left +
              iconRect.width / 2 -
              (buttonRect.left + buttonRect.width / 2),
          ) > 1 ||
          Math.abs(
            iconRect.top +
              iconRect.height / 2 -
              (buttonRect.top + buttonRect.height / 2),
          ) > 1
        );
      }),
      invalidToggle: (() => {
        if (!toggle || !toggleKnob) {
          return true;
        }
        const toggleRect = toggle.getBoundingClientRect();
        const knobRect = toggleKnob.getBoundingClientRect();
        return (
          knobRect.left < toggleRect.left ||
          knobRect.right > toggleRect.right ||
          knobRect.top < toggleRect.top ||
          knobRect.bottom > toggleRect.bottom
        );
      })(),
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
    missingSettingIcons: false,
    invalidSettingIcons: false,
    invalidTopActionIcons: false,
    invalidVisibleIconButtons: false,
    invalidToggle: false,
    footerOverlap: false,
  });
  const initialToggleGeometry = await readToggleGeometry(panel);
  expectToggleGeometry(initialToggleGeometry, initialToggleGeometry.checked);
  await panel.locator(".toggle").click();
  await panel.waitForTimeout(180);
  expectToggleGeometry(
    await readToggleGeometry(panel),
    !initialToggleGeometry.checked,
  );
  await panel.locator(".toggle").click();
  await panel.waitForTimeout(180);
  expectToggleGeometry(
    await readToggleGeometry(panel),
    initialToggleGeometry.checked,
  );
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

  const suspendedPayload = encodeURIComponent(
    JSON.stringify({
      version: 1,
      resourceId: `locale-confirmation-${localeKey}`,
      url: "https://example.com/restore-confirmation",
      title: "Restore confirmation",
    }),
  );
  const suspendedPage = await context.newPage();
  await suspendedPage.goto(
    `chrome-extension://${extensionId}/suspended.html#${suspendedPayload}`,
  );
  await expect(
    suspendedPage.getByText(expectations.deepSleepPageState, { exact: true }),
  ).toBeVisible();
  await expect(
    suspendedPage.getByRole("button", {
      name: expectations.deepSleepPageRestore,
    }),
  ).toBeVisible();
  await suspendedPage.waitForTimeout(300);
  expect(suspendedPage.url()).toContain(
    `chrome-extension://${extensionId}/suspended.html`,
  );
  expect(
    await suspendedPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await suspendedPage.screenshot({
    path: join(artifactsPath, `suspended-${localeKey}-${requestedTheme}.png`),
    fullPage: true,
  });
  await suspendedPage.close();

  if (runtimeErrors.length > 0) {
    throw new Error(
      `${requestedLocale} panel errors: ${runtimeErrors.join("; ")}`,
    );
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
        deepSleepRequiresConfirmation: true,
        groupOverviewScreenshot: `artifacts/group-overview-${localeKey}-${requestedTheme}.png`,
        screenshot: `artifacts/sidepanel-${localeKey}-${requestedTheme}.png`,
        suspendedScreenshot: `artifacts/suspended-${localeKey}-${requestedTheme}.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
}
