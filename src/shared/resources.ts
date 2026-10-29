import type { Resource } from "./types";

export interface ResourceTitleCandidate {
  title: string;
  createdAt: number;
}

function normalizedTitle(title: string | undefined): string {
  return title?.trim() ?? "";
}

export function getCompletedTabTitle(
  tab: Pick<chrome.tabs.Tab, "status" | "title">,
  completed = tab.status === "complete",
): string | undefined {
  const title = normalizedTitle(tab.title);
  return completed && title ? title : undefined;
}

export function getSavedTitleUpdate(
  resource: Pick<Resource, "stableTitle" | "savedTitleAt">,
  savedAt: number,
): Pick<Resource, "savedTitleAt"> & Partial<Pick<Resource, "savedTitle">> {
  const stableTitle = normalizedTitle(resource.stableTitle);
  return {
    ...(stableTitle ? { savedTitle: stableTitle } : {}),
    savedTitleAt: resource.savedTitleAt ?? savedAt,
  };
}

export function getResourceDisplayTitle(
  resource: Pick<Resource, "customTitle" | "savedTitle" | "title">,
): string {
  return (
    normalizedTitle(resource.customTitle) ||
    normalizedTitle(resource.savedTitle) ||
    normalizedTitle(resource.title)
  );
}

export function getResourceSavedTitle(
  resource: Pick<Resource, "savedTitle" | "stableTitle" | "title">,
): string {
  return (
    normalizedTitle(resource.savedTitle) ||
    normalizedTitle(resource.stableTitle) ||
    normalizedTitle(resource.title)
  );
}

export function selectHistoricalSavedTitle(
  resource: Pick<Resource, "savedTitle" | "title" | "domain">,
  candidates: ResourceTitleCandidate[],
  savedAt: number,
): string {
  const validCandidates = candidates
    .map((candidate) => ({
      title: normalizedTitle(candidate.title),
      createdAt: candidate.createdAt,
    }))
    .filter(
      (candidate) =>
        candidate.title.length > 0 && Number.isFinite(candidate.createdAt),
    )
    .sort((left, right) => left.createdAt - right.createdAt);
  const beforeSave = validCandidates.filter(
    (candidate) => candidate.createdAt <= savedAt,
  );

  return (
    beforeSave.at(-1)?.title ||
    validCandidates[0]?.title ||
    normalizedTitle(resource.savedTitle) ||
    normalizedTitle(resource.title) ||
    resource.domain
  );
}
