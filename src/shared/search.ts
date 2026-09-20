import type { Resource } from "./types";

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function matchesResourceSubstring(
  resource: Resource,
  query: string,
): boolean {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }

  const fields = [
    resource.customTitle ?? "",
    resource.title,
    resource.originalUrl,
    resource.domain,
    resource.notes,
  ].map(normalizeSearchText);

  return terms.every((term) =>
    fields.some((field) => field.includes(term)),
  );
}
