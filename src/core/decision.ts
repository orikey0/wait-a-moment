import type { Grant, SiteRule } from '../shared/types';
import { matchingRules, pickMostSpecific } from './rules';
import { isGrantActive } from './timing';

export type Decision =
  { kind: 'ignore' } | { kind: 'pass' } | { kind: 'granted' } | { kind: 'block'; rule: SiteRule };

export interface DecisionContext {
  rules: readonly SiteRule[];
  grants: Readonly<Record<string, Grant | undefined>>;
  paused: boolean;
  now: number;
}

/**
 * Decides what happens to a main-frame navigation. A page is blocked when at least one enabled rule
 * matches it and none of the matching rules has an active grant. Granting a rule therefore covers
 * every page that rule matches, in every tab.
 */
export function decideNavigation(url: URL | null, context: DecisionContext): Decision {
  if (!url) return { kind: 'ignore' };
  if (context.paused) return { kind: 'pass' };
  const matched = matchingRules(context.rules, url);
  if (matched.length === 0) return { kind: 'pass' };
  if (matched.some((rule) => isGrantActive(context.grants[rule.id], context.now))) {
    return { kind: 'granted' };
  }
  const rule = pickMostSpecific(matched);
  return rule ? { kind: 'block', rule } : { kind: 'pass' };
}

/** Key used to detect single-page-app route changes: the host plus the path, ignoring query and hash. */
export function pathKey(url: URL): string {
  return `${url.host}${url.pathname}`;
}
