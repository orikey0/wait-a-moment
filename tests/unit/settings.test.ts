import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySettingsPatch,
  defaultSettings,
  normalizeGrantOptions,
  normalizeSettings,
  parseGrantMinutes,
  validatePatch,
} from '../../src/core/settings';

describe('settings defaults', () => {
  it('waits 10 seconds, offers 1, 2, 5 and 10 minutes, and turns interception on', () => {
    const settings = defaultSettings();
    assert.equal(settings.waitSeconds, 10);
    assert.deepEqual(settings.grantMinutes, [1, 2, 5, 10]);
    assert.equal(settings.paused, false);
    assert.equal(settings.wordsEnabled, true);
    assert.equal(settings.statsEnabled, true);
  });

  it('returns a fresh object each time, so callers cannot share mutable state', () => {
    const first = defaultSettings();
    first.grantMinutes.push(99);
    assert.deepEqual(defaultSettings().grantMinutes, [1, 2, 5, 10]);
  });
});

describe('grant options', () => {
  it('parses separators in both languages and sorts the result', () => {
    assert.deepEqual(parseGrantMinutes('10，2、5 1'), [1, 2, 5, 10]);
  });

  it('rejects zero, out-of-range, fractional, non-numeric and too many options', () => {
    for (const text of ['0', '121', '1.5', 'abc', '1,2,3,4,5,6,7']) {
      assert.equal(parseGrantMinutes(text), null, text);
    }
  });

  it('removes duplicates', () => {
    assert.deepEqual(normalizeGrantOptions([5, 5, 1]), [1, 5]);
  });
});

describe('settings validation', () => {
  it('accepts a valid partial patch', () => {
    assert.deepEqual(validatePatch({ waitSeconds: 0, motion: 'full', paused: true }), {
      waitSeconds: 0,
      motion: 'full',
      paused: true,
    });
  });

  it('rejects unknown keys, out-of-range values and unknown choices', () => {
    assert.equal(validatePatch({ waitSeconds: 121 }), null);
    assert.equal(validatePatch({ theme: 'blue' }), null);
    assert.equal(validatePatch({ paused: 'yes' }), null);
    assert.equal(validatePatch({ admin: true }), null);
    assert.equal(validatePatch(null), null);
    assert.equal(validatePatch([]), null);
  });

  it('applies a valid patch on top of current settings and rejects an invalid one', () => {
    const current = defaultSettings();
    assert.equal(applySettingsPatch(current, { waitSeconds: 30 })?.waitSeconds, 30);
    assert.equal(applySettingsPatch(current, { waitSeconds: 500 }), null);
  });

  it('keeps valid stored fields when only one stored value is damaged', () => {
    const settings = normalizeSettings({ waitSeconds: 'soon', theme: 'dark', paused: true });
    assert.equal(settings.waitSeconds, 10);
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.paused, true);
  });

  it('falls back to defaults for unreadable stored settings', () => {
    assert.deepEqual(normalizeSettings(undefined), defaultSettings());
    assert.deepEqual(normalizeSettings('garbage'), defaultSettings());
  });
});
