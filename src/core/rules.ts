import type { SiteRule } from '../shared/types';

export const MAX_RULES = 500;
export const MAX_PATH_LENGTH = 200;
export const DEFAULT_HOSTS: readonly string[] = ['zhihu.com', 'tophub.today', 'x.com', 'v2ex.com'];

const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const UNSAFE_SCHEME = /^(?:javascript|data|file|vbscript|blob|chrome|about):/i;

export type RuleInputError = 'empty' | 'unsafe_protocol' | 'invalid_host' | 'invalid_path';

export type NormalizedRule =
  { ok: true; host: string; pathPrefix: string } | { ok: false; error: RuleInputError };

export type RuleScope = Pick<SiteRule, 'host' | 'pathPrefix' | 'includeSubdomains'>;

/**
 * Normalises user input such as "x.com", "https://www.x.com/hot/" or "x.com/hot?q=1".
 * Ports, query strings and fragments are ignored. Input is never turned into a regular expression.
 */
export function normalizeRuleInput(input: string): NormalizedRule {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };
  if (UNSAFE_SCHEME.test(trimmed)) return { ok: false, error: 'unsafe_protocol' };

  let url: URL;
  try {
    url = new URL(EXPLICIT_SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return { ok: false, error: 'invalid_host' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'unsafe_protocol' };
  }
  const host = url.hostname.replace(/\.$/, '');
  if (!HOST_PATTERN.test(host)) return { ok: false, error: 'invalid_host' };
  const pathPrefix = url.pathname.replace(/\/+$/, '') || '/';
  if (pathPrefix.length > MAX_PATH_LENGTH) return { ok: false, error: 'invalid_path' };
  return { ok: true, host, pathPrefix };
}

/**
 * Host match is exact, or a dot-bounded suffix when subdomains are included, so "notexample.com"
 * never matches "example.com". Path match is segment-aware: "/hot" matches "/hot" and "/hot/x"
 * but not "/hotel".
 */
export function ruleMatchesUrl(rule: SiteRule, url: URL): boolean {
  const { hostname, pathname } = url;
  const hostMatches =
    hostname === rule.host || (rule.includeSubdomains && hostname.endsWith(`.${rule.host}`));
  if (!hostMatches) return false;
  if (rule.pathPrefix === '/') return true;
  return pathname === rule.pathPrefix || pathname.startsWith(`${rule.pathPrefix}/`);
}

export function matchingRules(rules: readonly SiteRule[], url: URL): SiteRule[] {
  return rules.filter((rule) => rule.enabled && ruleMatchesUrl(rule, url));
}

/** The longest path prefix wins, then the longest host. A grant is recorded against this rule. */
export function pickMostSpecific(rules: readonly SiteRule[]): SiteRule | undefined {
  let best: SiteRule | undefined;
  for (const rule of rules) {
    if (!best || isMoreSpecific(rule, best)) best = rule;
  }
  return best;
}

function isMoreSpecific(a: SiteRule, b: SiteRule): boolean {
  if (a.pathPrefix.length !== b.pathPrefix.length) return a.pathPrefix.length > b.pathPrefix.length;
  return a.host.length > b.host.length;
}

export function findDuplicate(
  rules: readonly SiteRule[],
  candidate: RuleScope,
): SiteRule | undefined {
  return rules.find(
    (rule) =>
      rule.host === candidate.host &&
      rule.pathPrefix === candidate.pathPrefix &&
      rule.includeSubdomains === candidate.includeSubdomains,
  );
}

export function createRule(scope: RuleScope, id: string, now: number): SiteRule {
  return { id, ...scope, enabled: true, createdAt: now };
}

export function createDefaultRules(makeId: () => string, now: number): SiteRule[] {
  return DEFAULT_HOSTS.map((host) =>
    createRule({ host, pathPrefix: '/', includeSubdomains: true }, makeId(), now),
  );
}

export function isSiteRule(value: unknown): value is SiteRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Partial<Record<keyof SiteRule, unknown>>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.host === 'string' &&
    typeof rule.pathPrefix === 'string' &&
    typeof rule.includeSubdomains === 'boolean' &&
    typeof rule.enabled === 'boolean' &&
    typeof rule.createdAt === 'number'
  );
}
