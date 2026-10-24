import type { Motion, Settings, Theme } from '../shared/types';

export const MAX_WAIT_SECONDS = 120;
export const MAX_GRANT_MINUTES = 120;
export const MAX_GRANT_OPTIONS = 6;

const MOTIONS: readonly Motion[] = ['system', 'reduced', 'full'];
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const SETTING_KEYS: readonly string[] = [
  'waitSeconds',
  'grantMinutes',
  'moveButtons',
  'motion',
  'wordsEnabled',
  'statsEnabled',
  'paused',
  'theme',
];

export function defaultSettings(): Settings {
  return {
    waitSeconds: 10,
    grantMinutes: [1, 2, 5, 10],
    moveButtons: true,
    motion: 'system',
    wordsEnabled: true,
    statsEnabled: true,
    paused: false,
    theme: 'system',
  };
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Returns sorted, de-duplicated grant options, or null when the list is not valid. */
export function normalizeGrantOptions(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GRANT_OPTIONS) {
    return null;
  }
  const items: unknown[] = value;
  if (!items.every((item) => isInteger(item, 1, MAX_GRANT_MINUTES))) return null;
  return [...new Set(items)].sort((a, b) => a - b);
}

/** Parses a user-typed list such as "1, 2, 5 10". Returns null when any part is invalid. */
export function parseGrantMinutes(text: string): number[] | null {
  const parts = text.split(/[\s,，、]+/).filter((part) => part !== '');
  return normalizeGrantOptions(parts.map((part) => Number(part)));
}

/** Validates a partial settings object. Unknown keys and invalid values reject the whole patch. */
export function validatePatch(patch: unknown): Partial<Settings> | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return null;
  const out: Partial<Settings> = {};
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'waitSeconds':
        if (!isInteger(value, 0, MAX_WAIT_SECONDS)) return null;
        out.waitSeconds = value;
        break;
      case 'grantMinutes': {
        const minutes = normalizeGrantOptions(value);
        if (!minutes) return null;
        out.grantMinutes = minutes;
        break;
      }
      case 'moveButtons':
        if (typeof value !== 'boolean') return null;
        out.moveButtons = value;
        break;
      case 'motion':
        if (!isOneOf(value, MOTIONS)) return null;
        out.motion = value;
        break;
      case 'wordsEnabled':
        if (typeof value !== 'boolean') return null;
        out.wordsEnabled = value;
        break;
      case 'statsEnabled':
        if (typeof value !== 'boolean') return null;
        out.statsEnabled = value;
        break;
      case 'paused':
        if (typeof value !== 'boolean') return null;
        out.paused = value;
        break;
      case 'theme':
        if (!isOneOf(value, THEMES)) return null;
        out.theme = value;
        break;
      default:
        return null;
    }
  }
  return out;
}

export function applySettingsPatch(current: Settings, patch: unknown): Settings | null {
  const validated = validatePatch(patch);
  return validated ? { ...current, ...validated } : null;
}

/**
 * Reads stored settings. Each field is checked on its own, so one damaged value falls back to its
 * default without discarding the rest.
 */
export function normalizeSettings(raw: unknown): Settings {
  let settings = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const record = raw as Record<string, unknown>;
  for (const key of SETTING_KEYS) {
    const patch = validatePatch({ [key]: record[key] });
    if (patch) settings = { ...settings, ...patch };
  }
  return settings;
}
