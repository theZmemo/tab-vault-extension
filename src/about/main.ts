import { t, uiLocale } from "../shared/i18n";
import "./styles.css";

const setText = (selector: string, value: string): void => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = value;
  }
};

document.documentElement.lang = uiLocale;
document.title = `${t("productIntroduction")} · ${t("appName")}`;

setText("#about-kicker", t("productIntroduction"));
setText("#about-title", t("appName"));
setText("#about-description", t("aboutDescription"));
setText("#spotlight-title", t("aboutHighlights"));
setText("#capability-title", t("aboutToolkit"));
setText("#privacy-title", t("privacyAndData"));
setText("#privacy-description", t("localDataDisclosure"));
setText(
  "#version-label",
  t("versionLabel", { version: chrome.runtime.getManifest().version }),
);
setText("#privacy-link", t("viewPrivacyPolicy"));
setText("#website-link", t("officialWebsite"));

const spotlightList = document.querySelector<HTMLElement>("#spotlight-list");
const spotlights = [
  {
    title: t("pinnedResources"),
    description: t("aboutPinnedFeature"),
    tone: "blue",
  },
  {
    title: t("recoveryCenter"),
    description: t("aboutRecoveryFeature"),
    tone: "green",
  },
];

if (spotlightList) {
  for (const [index, spotlight] of spotlights.entries()) {
    const article = document.createElement("article");
    article.className = `spotlight-card tone-${spotlight.tone}`;

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("strong");
    title.textContent = spotlight.title;

    const description = document.createElement("p");
    description.textContent = spotlight.description;

    article.append(number, title, description);
    spotlightList.append(article);
  }
}

const capabilityList = document.querySelector<HTMLElement>("#capability-list");
const capabilities = [
  {
    title: t("permanentGroups"),
    description: t("aboutGroupsFeature"),
  },
  {
    title: t("searchResources"),
    description: t("aboutSearchFeature"),
  },
  {
    title: t("batchSleepTabs"),
    description: t("aboutSleepFeature"),
  },
  {
    title: t("duplicatePages"),
    description: t("aboutDuplicateFeature"),
  },
  {
    title: t("archived"),
    description: t("aboutArchiveFeature"),
  },
  {
    title: t("storageCleanup"),
    description: t("aboutCleanupFeature"),
  },
  {
    title: t("importExport"),
    description: t("aboutBackupFeature"),
  },
  {
    title: t("privacyAndData"),
    description: t("aboutPrivacyFeature"),
  },
];

if (capabilityList) {
  for (const [index, capability] of capabilities.entries()) {
    const row = document.createElement("div");
    row.className = "capability-row";

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = capability.title;

    const description = document.createElement("p");
    description.textContent = capability.description;

    content.append(title, description);
    row.append(number, content);
    capabilityList.append(row);
  }
}
