import type {
  VaultCommand,
  VaultExport,
  VaultResponse,
} from "../shared/types";
import { t } from "../shared/i18n";

export async function sendCommand<T = undefined>(
  command: VaultCommand,
): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    command,
  )) as VaultResponse<T>;

  if (!response?.ok) {
    throw new Error(response?.error || t("actionFailed"));
  }
  return response.data as T;
}

export function downloadBackup(data: VaultExport): void {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tab-vault-backup-${timestamp}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readBackup(file: File): Promise<VaultExport> {
  const content = await file.text();
  const data = JSON.parse(content) as Partial<VaultExport>;
  if (data.format !== "tab-vault" || data.version !== 1) {
    throw new Error(t("invalidBackup"));
  }
  return data as VaultExport;
}
