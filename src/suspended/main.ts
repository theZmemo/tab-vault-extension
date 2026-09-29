import { parseDeepSleepPayload } from "../shared/deepSleep";
import { t, uiLocale } from "../shared/i18n";
import "./styles.css";

const suspendedPageUrl = chrome.runtime.getURL("suspended.html");
const payload = parseDeepSleepPayload(window.location.href, suspendedPageUrl);
const stateLabel = document.querySelector<HTMLElement>("#state-label");
const pageTitle = document.querySelector<HTMLElement>("#page-title");
const pageDomain = document.querySelector<HTMLElement>("#page-domain");
const statusCopy = document.querySelector<HTMLElement>("#status-copy");
const restoreButton =
  document.querySelector<HTMLButtonElement>("#restore-button");
let restoreStarted = false;

document.documentElement.lang = uiLocale;
document.title = payload
  ? `${payload.title} · ${t("deepSleepPageTitle")}`
  : t("deepSleepPageTitle");

if (stateLabel) {
  stateLabel.textContent = t("deepSleepPageTitle");
}
if (pageTitle) {
  pageTitle.textContent = payload?.title ?? t("deepSleepPageState");
}
if (pageDomain) {
  pageDomain.textContent = payload
    ? new URL(payload.url).hostname || t("localFile")
    : "";
}
if (statusCopy) {
  statusCopy.textContent = payload
    ? t("deepSleepPageState")
    : t("deepSleepPageRecoveryUnavailable");
}
if (restoreButton) {
  restoreButton.textContent = t("deepSleepPageRestore");
  restoreButton.disabled = !payload;
}

async function restorePage(): Promise<void> {
  if (restoreStarted || !payload) {
    return;
  }
  restoreStarted = true;
  if (statusCopy) {
    statusCopy.textContent = t("deepSleepPageRestoring");
  }
  if (restoreButton) {
    restoreButton.disabled = true;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "RESTORE_DEEP_SLEEP_TAB",
    })) as { ok?: boolean; data?: boolean };
    if (!response?.ok || response.data === false) {
      window.location.replace(payload.url);
    }
  } catch {
    window.location.replace(payload.url);
  }
}

restoreButton?.addEventListener("click", () => {
  void restorePage();
});
