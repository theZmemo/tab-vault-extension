import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "src/shared/i18n.ts");
const outputRoot = resolve(projectRoot, "src/shared/locales");
const separator = "ZXQSPLITQXZ";
const protectedTerms = [
  "Tab Vault",
  "IndexedDB",
  "Chrome",
  "JSON",
  "SPA",
  "URL",
];

const targets = [
  { locale: "zh-TW", language: "zh-TW", source: "zh-CN" },
  { locale: "ja", language: "ja", source: "en" },
  { locale: "ko", language: "ko", source: "en" },
  { locale: "es", language: "es", source: "en" },
  { locale: "fr", language: "fr", source: "en" },
  { locale: "de", language: "de", source: "en" },
  { locale: "pt-BR", language: "pt", source: "en" },
  { locale: "ru", language: "ru", source: "en" },
];

const overrides = {
  "zh-TW": {
    appName: "標籤資產庫",
    appShortName: "標籤資產庫",
    sleep: "休眠",
    sleeping: "已休眠",
    sleepLevelDeep: "第 4 級 · 深度休眠",
    deepSleepAllTabs: "深度休眠所有可操作網頁標籤",
    statusDeepSleeping: "深度休眠",
    deepSleepPageTitle: "深度休眠",
    deepSleepPageState: "此標籤正在深度休眠",
    deepSleepPageRestore: "立即恢復",
    confirmDeepSleep: "確認並開始深度休眠",
    privacyAndData: "隱私與資料",
  },
  ja: {
    appName: "タブ保管庫",
    appShortName: "タブ保管庫",
    currentOpen: "現在開いている",
    permanentGroups: "常設グループ",
    sortManual: "手動",
    recoveryCenter: "復元",
    sleep: "スリープ",
    sleeping: "スリープ中",
    batchSleepTabs: "タブをスリープ",
    sleepLevelDeep: "レベル 4 · ディープスリープ",
    deepSleepAllTabs: "操作可能なすべてのウェブタブをディープスリープ",
    statusSleeping: "スリープ中",
    statusDeepSleeping: "ディープスリープ",
    deepSleepWarningTitle: "ディープスリープの確認",
    deepSleepPageTitle: "ディープスリープ",
    deepSleepPageState: "このタブはディープスリープ中です",
    deepSleepPageRestoring: "ページを復元しています...",
    deepSleepPageRestore: "今すぐ復元",
    confirmDeepSleep: "確認してディープスリープを開始",
    moreItems: "あと {count} 件",
    idleMinutes: "アイドル状態が続いた後にスリープする時間（分）",
    snapshotInterval: "セッションスナップショット間隔（分）",
    restoreConcurrency: "同時に復元するページ数",
  },
  ko: {
    appName: "탭 보관함",
    appShortName: "탭 보관함",
    currentOpen: "현재 열림",
    sortManual: "수동",
    recoveryCenter: "복구",
    resourceViews: "리소스 보기",
    sleep: "절전",
    sleeping: "절전 중",
    batchSleepTabs: "탭 절전",
    sleepLevelDeep: "4단계 · 딥 슬립",
    deepSleepAllTabs: "작업 가능한 모든 웹 탭 딥 슬립",
    statusSleeping: "절전 중",
    statusDeepSleeping: "딥 슬립",
    deepSleepWarningTitle: "딥 슬립 확인",
    deepSleepPageTitle: "딥 슬립",
    deepSleepPageState: "이 탭은 딥 슬립 상태입니다",
    deepSleepPageRestoring: "페이지 복원 중...",
    deepSleepPageRestore: "지금 복원",
    confirmDeepSleep: "확인 후 딥 슬립 시작",
    restoreConcurrency: "동시에 복원할 페이지 수",
  },
  es: {
    sleep: "Suspender",
    sleeping: "En suspensión",
    batchSleepTabs: "Suspender pestañas",
    sleepLevelDeep: "Nivel 4 · Suspensión profunda",
    deepSleepAllTabs: "Suspender profundamente todas las pestañas web",
    statusDeepSleeping: "Suspensión profunda",
    deepSleepWarningTitle: "Antes de la suspensión profunda",
    deepSleepPageTitle: "Suspensión profunda",
    deepSleepPageRestore: "Restaurar ahora",
    confirmDeepSleep: "Confirmar e iniciar la suspensión profunda",
  },
  fr: {
    sleep: "Mettre en veille",
    sleeping: "En veille",
    batchSleepTabs: "Mettre les onglets en veille",
    sleepLevelDeep: "Niveau 4 · Veille profonde",
    deepSleepAllTabs: "Mettre tous les onglets web en veille profonde",
    statusDeepSleeping: "Veille profonde",
    deepSleepWarningTitle: "Avant la veille profonde",
    deepSleepPageTitle: "Veille profonde",
    deepSleepPageRestore: "Restaurer maintenant",
    confirmDeepSleep: "Confirmer et lancer la veille profonde",
  },
  de: {
    sleep: "Ruhezustand",
    sleeping: "Im Ruhezustand",
    batchSleepTabs: "Tabs in Ruhezustand versetzen",
    sleepLevelDeep: "Stufe 4 · Tiefschlaf",
    deepSleepAllTabs: "Alle Web-Tabs in den Tiefschlaf versetzen",
    statusDeepSleeping: "Tiefschlaf",
    deepSleepWarningTitle: "Vor dem Tiefschlaf",
    deepSleepPageTitle: "Tiefschlaf",
    deepSleepPageRestore: "Jetzt wiederherstellen",
    confirmDeepSleep: "Bestätigen und Tiefschlaf starten",
  },
  "pt-BR": {
    sleep: "Suspender",
    sleeping: "Suspensas",
    batchSleepTabs: "Suspender abas",
    sleepLevelDeep: "Nível 4 · Suspensão profunda",
    deepSleepAllTabs: "Suspender profundamente todas as abas da web",
    statusDeepSleeping: "Suspensão profunda",
    deepSleepWarningTitle: "Antes da suspensão profunda",
    deepSleepPageTitle: "Suspensão profunda",
    deepSleepPageRestore: "Restaurar agora",
    confirmDeepSleep: "Confirmar e iniciar a suspensão profunda",
  },
  ru: {
    sleep: "Усыпить",
    sleeping: "Спящие",
    batchSleepTabs: "Усыпить вкладки",
    sleepLevelDeep: "Уровень 4 · Глубокий сон",
    deepSleepAllTabs: "Перевести все веб-вкладки в глубокий сон",
    statusDeepSleeping: "Глубокий сон",
    deepSleepWarningTitle: "Перед глубоким сном",
    deepSleepPageTitle: "Глубокий сон",
    deepSleepPageRestore: "Восстановить сейчас",
    confirmDeepSleep: "Подтвердить и запустить глубокий сон",
    hoursAgo: "{count} ч назад",
  },
};

async function loadSourceDictionaries() {
  const source = await readFile(sourcePath, "utf8");
  const extractObject = (declaration, terminator) => {
    const declarationIndex = source.indexOf(declaration);
    if (declarationIndex < 0) {
      throw new Error(`Missing dictionary declaration: ${declaration}`);
    }
    const start = declarationIndex + declaration.length;
    const end = source.indexOf(terminator, start);
    if (end < 0) {
      throw new Error(`Missing dictionary terminator: ${terminator}`);
    }
    const expression = source.slice(start, end + 1);
    return Function(`"use strict"; return (${expression});`)();
  };

  return {
    en: extractObject("const en = ", "} as const;"),
    "zh-CN": extractObject(
      "const zh: Record<MessageKey, string> = ",
      "};\n\nexport const SUPPORTED_UI_LOCALES",
    ),
  };
}

function protectText(text) {
  const values = [];
  const protect = (value) => {
    const index = values.push(value) - 1;
    return `ZXQ${index}QXZ`;
  };
  let protectedText = text.replace(/\{\w+\}/g, protect);
  for (const term of protectedTerms) {
    protectedText = protectedText.replaceAll(term, protect(term));
  }
  return {
    text: protectedText,
    restore: (translated) =>
      translated.replace(
        /ZXQ(\d+)QX[ZЖ]/g,
        (_match, index) => values[Number(index)],
      ),
  };
}

async function requestTranslation(text, source, target) {
  const parameters = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });
  const response = await fetch(
    "https://translate.googleapis.com/translate_a/single",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: parameters,
    },
  );
  if (!response.ok) {
    throw new Error(`Translation request failed: ${response.status}`);
  }
  const data = await response.json();
  return data[0].map((part) => part[0]).join("");
}

async function translateDictionary(dictionary, source, target) {
  const entries = Object.entries(dictionary);
  const translated = {};

  for (let offset = 0; offset < entries.length; offset += 20) {
    const chunk = entries.slice(offset, offset + 20);
    const protectedChunk = chunk.map(([, value]) => protectText(value));
    const combined = protectedChunk.map((item) => item.text).join(`\n${separator}\n`);
    const result = await requestTranslation(combined, source, target);
    const parts = result.split(new RegExp(`\\s*${separator}\\s*`));
    if (parts.length !== chunk.length) {
      throw new Error(
        `Expected ${chunk.length} translations, received ${parts.length}`,
      );
    }
    chunk.forEach(([key], index) => {
      translated[key] = protectedChunk[index].restore(parts[index].trim());
    });
  }

  return translated;
}

await mkdir(outputRoot, { recursive: true });
const sourceDictionaries = await loadSourceDictionaries();

for (const target of targets) {
  const dictionary = await translateDictionary(
    sourceDictionaries[target.source],
    target.source,
    target.language,
  );
  Object.assign(dictionary, overrides[target.locale]);
  await writeFile(
    resolve(outputRoot, `${target.locale}.json`),
    `${JSON.stringify(dictionary, null, 2)}\n`,
  );
  console.log(`${target.locale}: ${Object.keys(dictionary).length} messages`);
}
