import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOSTS,
  createDefaultRules,
  findDuplicate,
  isSiteRule,
  matchingRules,
  normalizeRuleInput,
  pickMostSpecific,
  ruleMatchesUrl,
} from '../../src/core/rules';
import type { SiteRule } from '../../src/shared/types';

function rule(
  host: string,
  pathPrefix = '/',
  includeSubdomains = true,
  id = host + pathPrefix,
): SiteRule {
  return { id, host, pathPrefix, includeSubdomains, enabled: true, createdAt: 0 };
}

function url(raw: string): URL {
  return new URL(raw);
}

describe('normalizeRuleInput', () => {
  it('accepts a bare domain and a full URL', () => {
    assert.deepEqual(normalizeRuleInput('example.com'), {
      ok: true,
      host: 'example.com',
      pathPrefix: '/',
    });
    assert.deepEqual(normalizeRuleInput('https://www.Example.com/Hot/'), {
      ok: true,
      host: 'www.example.com',
      pathPrefix: '/Hot',
    });
  });

  it('drops query strings, fragments and ports', () => {
    assert.deepEqual(normalizeRuleInput('x.com/hot?q=1#top'), {
      ok: true,
      host: 'x.com',
      pathPrefix: '/hot',
    });
    assert.deepEqual(normalizeRuleInput('x.com:8443'), {
      ok: true,
      host: 'x.com',
      pathPrefix: '/',
    });
  });

  it('rejects empty input', () => {
    assert.deepEqual(normalizeRuleInput(''), { ok: false, error: 'empty' });
    assert.deepEqual(normalizeRuleInput('   '), { ok: false, error: 'empty' });
  });

  it('rejects dangerous and non-web protocols', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'ftp://x.com',
      'chrome://settings',
    ]) {
      assert.deepEqual(normalizeRuleInput(raw), { ok: false, error: 'unsafe_protocol' }, raw);
    }
  });

  it('rejects hosts that are not public domain names', () => {
    for (const raw of ['localhost', '127.0.0.1', 'bad_host.com', 'a..b.com']) {
      assert.deepEqual(normalizeRuleInput(raw), { ok: false, error: 'invalid_host' }, raw);
    }
  });

  it('accepts internationalised domains as punycode', () => {
    const result = normalizeRuleInput('例子.中国');
    assert.deepEqual(result, { ok: true, host: 'xn--fsqu00a.xn--fiqs8s', pathPrefix: '/' });
  });

  it('rejects over-long paths', () => {
    assert.deepEqual(normalizeRuleInput(`x.com/${'a'.repeat(250)}`), {
      ok: false,
      error: 'invalid_path',
    });
  });
});

describe('ruleMatchesUrl', () => {
  it('matches the domain and its subdomains when subdomains are included', () => {
    const r = rule('example.com');
    assert.ok(ruleMatchesUrl(r, url('https://example.com/')));
    assert.ok(ruleMatchesUrl(r, url('https://www.example.com/a')));
    assert.ok(ruleMatchesUrl(r, url('https://a.b.example.com/')));
  });

  it('never matches a string that only ends with the domain', () => {
    const r = rule('example.com');
    assert.equal(ruleMatchesUrl(r, url('https://notexample.com/')), false);
    assert.equal(ruleMatchesUrl(r, url('https://example.com.evil.net/')), false);
  });

  it('matches only the exact host when subdomains are excluded', () => {
    const r = rule('example.com', '/', false);
    assert.ok(ruleMatchesUrl(r, url('https://example.com/')));
    assert.equal(ruleMatchesUrl(r, url('https://www.example.com/')), false);
  });

  it('matches path prefixes on segment boundaries only', () => {
    const r = rule('x.com', '/hot');
    assert.ok(ruleMatchesUrl(r, url('https://x.com/hot')));
    assert.ok(ruleMatchesUrl(r, url('https://x.com/hot/')));
    assert.ok(ruleMatchesUrl(r, url('https://x.com/hot/1?q=2')));
    assert.equal(ruleMatchesUrl(r, url('https://x.com/hotel')), false);
    assert.equal(ruleMatchesUrl(r, url('https://x.com/')), false);
  });

  it('ignores disabled rules', () => {
    const disabled: SiteRule = { ...rule('x.com'), enabled: false };
    assert.deepEqual(matchingRules([disabled], url('https://x.com/')), []);
  });
});

describe('pickMostSpecific', () => {
  it('prefers a longer path prefix, then a longer host', () => {
    const broad = rule('x.com', '/');
    const path = rule('x.com', '/hot');
    assert.equal(pickMostSpecific([broad, path])?.pathPrefix, '/hot');
    const longerHost = rule('a.x.com', '/');
    assert.equal(pickMostSpecific([rule('x.com', '/'), longerHost])?.host, 'a.x.com');
    assert.equal(pickMostSpecific([]), undefined);
  });
});

describe('duplicates and defaults', () => {
  it('treats identical scope as a duplicate, but different subdomain setting as distinct', () => {
    const existing = [rule('example.com')];
    assert.ok(
      findDuplicate(existing, { host: 'example.com', pathPrefix: '/', includeSubdomains: true }),
    );
    assert.equal(
      findDuplicate(existing, { host: 'example.com', pathPrefix: '/', includeSubdomains: false }),
      undefined,
    );
  });

  it('creates the four example sites, all enabled and covering subdomains', () => {
    let counter = 0;
    const rules = createDefaultRules(() => `id-${(counter += 1)}`, 123);
    assert.deepEqual(
      rules.map((r) => r.host),
      [...DEFAULT_HOSTS],
    );
    assert.ok(rules.every((r) => r.enabled && r.includeSubdomains && r.pathPrefix === '/'));
    assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  });

  it('validates stored rule shapes', () => {
    assert.ok(isSiteRule(rule('x.com')));
    assert.equal(isSiteRule({ id: 'a' }), false);
    assert.equal(isSiteRule(null), false);
  });
});
