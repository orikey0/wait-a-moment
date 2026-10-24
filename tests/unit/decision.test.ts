import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideNavigation, pathKey } from '../../src/core/decision';
import { MINUTE_MS } from '../../src/core/timing';
import type { Grant, SiteRule } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

function rule(host: string, pathPrefix = '/', includeSubdomains = true): SiteRule {
  return {
    id: `${host}${pathPrefix}`,
    host,
    pathPrefix,
    includeSubdomains,
    enabled: true,
    createdAt: 0,
  };
}

function grantFor(id: string, startedAgo: number, minutes: number): Record<string, Grant> {
  return {
    [id]: {
      grantedAt: NOW - startedAgo,
      expiresAt: NOW - startedAgo + minutes * MINUTE_MS,
      minutes,
    },
  };
}

const zhihu = rule('zhihu.com');
const hot = rule('x.com', '/hot');
const xSite = rule('x.com');

describe('decideNavigation', () => {
  it('ignores pages that are not web pages', () => {
    assert.deepEqual(
      decideNavigation(null, { rules: [zhihu], grants: {}, paused: false, now: NOW }),
      {
        kind: 'ignore',
      },
    );
  });

  it('passes pages that no rule matches', () => {
    const url = new URL('https://example.org/');
    assert.deepEqual(
      decideNavigation(url, { rules: [zhihu], grants: {}, paused: false, now: NOW }),
      {
        kind: 'pass',
      },
    );
  });

  it('blocks a matching page when there is no grant', () => {
    const url = new URL('https://www.zhihu.com/question/1');
    const decision = decideNavigation(url, { rules: [zhihu], grants: {}, paused: false, now: NOW });
    assert.deepEqual(decision, { kind: 'block', rule: zhihu });
  });

  it('does not block anything while interception is paused', () => {
    const url = new URL('https://zhihu.com/');
    assert.deepEqual(
      decideNavigation(url, { rules: [zhihu], grants: {}, paused: true, now: NOW }),
      {
        kind: 'pass',
      },
    );
  });

  it('does not treat notexample.com as example.com', () => {
    const rules = [rule('example.com')];
    const url = new URL('https://notexample.com/');
    assert.deepEqual(decideNavigation(url, { rules, grants: {}, paused: false, now: NOW }), {
      kind: 'pass',
    });
  });

  it('shares one grant across every tab, because the grant belongs to the rule', () => {
    const grants = grantFor(zhihu.id, 0, 2);
    const first = new URL('https://zhihu.com/a');
    const second = new URL('https://www.zhihu.com/b');
    assert.deepEqual(decideNavigation(first, { rules: [zhihu], grants, paused: false, now: NOW }), {
      kind: 'granted',
    });
    assert.deepEqual(
      decideNavigation(second, { rules: [zhihu], grants, paused: false, now: NOW }),
      {
        kind: 'granted',
      },
    );
  });

  it('keeps grants of different domains independent', () => {
    const grants = grantFor(zhihu.id, 0, 5);
    const other = new URL('https://v2ex.com/');
    const rules = [zhihu, rule('v2ex.com')];
    assert.deepEqual(decideNavigation(other, { rules, grants, paused: false, now: NOW }), {
      kind: 'block',
      rule: rules[1],
    });
  });

  it('blocks again once the grant has expired', () => {
    const grants = grantFor(zhihu.id, 3 * MINUTE_MS, 2);
    const url = new URL('https://zhihu.com/');
    assert.deepEqual(decideNavigation(url, { rules: [zhihu], grants, paused: false, now: NOW }), {
      kind: 'block',
      rule: zhihu,
    });
  });

  it('applies the rule scope: subdomains share a grant only when the rule includes them', () => {
    const withSubdomains = rule('example.com', '/', true);
    const exactOnly = rule('example.com', '/', false);
    const sub = new URL('https://a.example.com/');
    const grants = grantFor(withSubdomains.id, 0, 1);
    assert.deepEqual(
      decideNavigation(sub, { rules: [withSubdomains], grants, paused: false, now: NOW }),
      { kind: 'granted' },
    );
    assert.deepEqual(
      decideNavigation(sub, { rules: [exactOnly], grants: {}, paused: false, now: NOW }),
      {
        kind: 'pass',
      },
    );
  });

  it('blocks with the most specific matching rule', () => {
    const url = new URL('https://x.com/hot/list');
    assert.deepEqual(
      decideNavigation(url, { rules: [xSite, hot], grants: {}, paused: false, now: NOW }),
      {
        kind: 'block',
        rule: hot,
      },
    );
  });

  it('allows a page when any matching rule holds a live grant', () => {
    const url = new URL('https://x.com/hot');
    const grants = grantFor(xSite.id, 0, 1);
    assert.deepEqual(
      decideNavigation(url, { rules: [xSite, hot], grants, paused: false, now: NOW }),
      {
        kind: 'granted',
      },
    );
  });

  it('builds the tab key from host and path, without query or hash', () => {
    assert.equal(pathKey(new URL('https://x.com/hot?q=1#a')), 'x.com/hot');
  });
});
