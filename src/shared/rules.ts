import type { Resource, Rule } from "./types";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function domainMatches(domain: string, pattern: string): boolean {
  const normalizedDomain = normalize(domain);
  const normalizedPattern = normalize(pattern);

  if (!normalizedPattern) {
    return false;
  }

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return (
      normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)
    );
  }

  return (
    normalizedDomain === normalizedPattern ||
    normalizedDomain.endsWith(`.${normalizedPattern}`)
  );
}

function includesAny(value: string, candidates: string[]): boolean {
  const normalizedValue = normalize(value);
  return candidates.some((candidate) =>
    normalizedValue.includes(normalize(candidate)),
  );
}

export function matchesRule(resource: Resource, rule: Rule): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (
    rule.excludedDomains.some((domain) =>
      domainMatches(resource.domain, domain),
    )
  ) {
    return false;
  }

  const checks: boolean[] = [];

  if (rule.domains.length > 0) {
    checks.push(
      rule.domains.some((domain) => domainMatches(resource.domain, domain)),
    );
  }

  if (rule.titleKeywords.length > 0) {
    checks.push(includesAny(resource.title, rule.titleKeywords));
  }

  if (rule.urlKeywords.length > 0) {
    checks.push(includesAny(resource.originalUrl, rule.urlKeywords));
  }

  if (checks.length === 0) {
    return false;
  }

  return rule.matchMode === "all"
    ? checks.every(Boolean)
    : checks.some(Boolean);
}
