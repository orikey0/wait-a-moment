import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackableUrl } from '../../src/core/url';

describe('parseTrackableUrl', () => {
  it('accepts http and https pages', () => {
    assert.equal(parseTrackableUrl('https://example.com/a')?.hostname, 'example.com');
    assert.equal(parseTrackableUrl('http://example.com')?.protocol, 'http:');
  });

  it('ignores Chrome-internal, extension, file and malformed URLs', () => {
    const rejected = [
      'chrome://settings',
      'chrome-extension://abc/blocked.html',
      'file:///tmp/a.html',
      'about:blank',
      'javascript:alert(1)',
      'not a url',
      '',
    ];
    for (const raw of rejected) {
      assert.equal(parseTrackableUrl(raw), null, raw);
    }
  });
});
