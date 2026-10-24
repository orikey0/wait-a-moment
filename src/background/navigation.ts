import { pruneBlocks, createBlock } from '../core/blocks';
import { decideNavigation, pathKey } from '../core/decision';
import { parseTrackableUrl } from '../core/url';
import { pickWords } from '../core/words';
import type { TabState, WordEntry } from '../shared/types';
import {
  exclusive,
  loadBlocks,
  loadGrants,
  loadRecentWords,
  loadRules,
  loadSettings,
  loadTabs,
  loadWords,
  writeSession,
} from './storage';

/** The same URL reported by several events within this window creates only one interception. */
const DUPLICATE_WINDOW_MS = 1_500;
const CARD_WORDS = 4;
const REMEMBERED_WORDS = 8;

export type NavigationSource = 'before' | 'commit' | 'spa';

/**
 * Handles a main-frame navigation, a redirect landing, or a single-page route change. Blocking is
 * done here in the service worker, so no content script is injected into any site.
 */
export function onPageNavigation(
  tabId: number,
  rawUrl: string,
  source: NavigationSource,
): Promise<void> {
  const url = parseTrackableUrl(rawUrl);
  if (!url) return Promise.resolve();

  return exclusive(async () => {
    const now = Date.now();
    const [rules, grants, settings, tabs] = await Promise.all([
      loadRules(),
      loadGrants(),
      loadSettings(),
      loadTabs(),
    ]);
    const tabKey = String(tabId);
    const tab: TabState = tabs[tabKey] ?? {};
    const path = pathKey(url);
    // A route change only counts when the path changes; query and hash updates are ignored.
    if (source === 'spa' && tab.path === path) return;

    const decision = decideNavigation(url, { rules, grants, paused: settings.paused, now });

    if (decision.kind === 'block') {
      const last = tab.lastBlock;
      if (last && last.url === rawUrl && now - last.at < DUPLICATE_WINDOW_MS) return;

      const blockId = crypto.randomUUID();
      const [blocks, recent] = await Promise.all([loadBlocks(), loadRecentWords()]);
      const words: Record<string, WordEntry> = settings.wordsEnabled ? await loadWords() : {};
      const wordIds = settings.wordsEnabled
        ? pickWords(Object.entries(words), now, CARD_WORDS, new Set(recent))
        : [];
      const block = createBlock({
        blockId,
        tabId,
        url: rawUrl,
        rule: decision.rule,
        now,
        waitMs: settings.waitSeconds * 1000,
        words: wordIds,
      });

      // Save before navigating, so the block page finds its record as soon as it loads.
      await writeSession({
        blocks: pruneBlocks({ ...blocks, [blockId]: block }, now),
        recentWords: [...new Set([...wordIds, ...recent])].slice(0, REMEMBERED_WORDS),
        tabs: { ...tabs, [tabKey]: { ...tab, path, lastBlock: { url: rawUrl, at: now } } },
      });
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL(`blocked.html?block=${blockId}`),
      });
      return;
    }

    // Allowed pages are remembered as the place "本次不浏览" returns to. Granted pages are not:
    // returning to them later could be blocked again.
    const safe = decision.kind === 'pass' && source !== 'before';
    const next: TabState = safe ? { ...tab, path, safeUrl: rawUrl } : { ...tab, path };
    if (next.path !== tab.path || next.safeUrl !== tab.safeUrl) {
      await writeSession({ tabs: { ...tabs, [tabKey]: next } });
    }
  });
}

export function onTabRemoved(tabId: number): Promise<void> {
  return exclusive(async () => {
    const tabs = await loadTabs();
    const key = String(tabId);
    if (!(key in tabs)) return;
    await writeSession({
      tabs: Object.fromEntries(Object.entries(tabs).filter(([id]) => id !== key)),
    });
  });
}
