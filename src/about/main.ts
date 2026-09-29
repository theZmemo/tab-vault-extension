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
setText("#privacy-title", t("privacyAndData"));
setText("#privacy-description", t("localDataDisclosure"));
setText(
  "#version-label",
  t("versionLabel", { version: chrome.runtime.getManifest().version }),
);
setText("#privacy-link", t("viewPrivacyPolicy"));
setText("#website-link", t("officialWebsite"));

const capabilityList = document.querySelector<HTMLElement>("#capability-list");
const capabilities = [
  t("permanentGroups"),
  t("searchResources"),
  t("batchSleepTabs"),
  t("recoveryCenter"),
];

if (capabilityList) {
  for (const [index, label] of capabilities.entries()) {
    const row = document.createElement("div");
    row.className = "capability-row";

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("strong");
    title.textContent = label;

    row.append(number, title);
    capabilityList.append(row);
  }
}
