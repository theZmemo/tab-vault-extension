import type { Resource } from "./types";

export interface ResourceTitleCandidate {
  title: string;
  createdAt: number;
}

function normalizedTitle(title: string | undefined): string {
  return title?.trim() ?? "";
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
  resource: Pick<Resource, "savedTitle" | "title">,
): string {
  return normalizedTitle(resource.savedTitle) || normalizedTitle(resource.title);
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
