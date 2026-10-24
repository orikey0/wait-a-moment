import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { dayKey, shiftDay } from '../../src/core/stats';
import { launchHarness, send, startSite } from './harness';

// Writes screenshots to test-results/screenshots for visual review. Nothing is compared pixel by pixel.
const OUT = path.join('test-results', 'screenshots');

test('captures the options and interception pages in light and dark themes', async () => {
  const site = await startSite();
  const harness = await launchHarness(path.join('test-results', `profile-${randomUUID()}`));
  try {
    const control = await harness.openExtensionPage('options.html');
    const reply = await send(control, {
      type: 'rules.add',
      input: 'site-a.localhost',
      includeSubdomains: true,
    });
    expect(reply.ok).toBe(true);

    // Seed seven days of statistics so the trend chart has bars to show.
    const today = dayKey(Date.now());
    const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
    const stats = {
      days: Object.fromEntries(
        days.map((day, index) => [
          day,
          {
            wordActions: index % 3,
            sites: {
              'zhihu.com': {
                shown: ((index * 3) % 7) + 1,
                abandoned: index % 4,
                granted: (index + 1) % 3,
                grantedMinutes: 5 * ((index + 1) % 3),
              },
              'x.com': { shown: index % 2, abandoned: 0, granted: 1, grantedMinutes: 2 },
            },
          },
        ]),
      ),
    };
    await control.evaluate((data: unknown) => chrome.storage.local.set({ stats: data }), stats);

    await control.setViewportSize({ width: 1000, height: 1400 });
    await control.reload();
    await control.screenshot({ path: path.join(OUT, 'options-light.png'), fullPage: true });

    await send(control, { type: 'settings.update', patch: { theme: 'dark' } });
    await control.reload();
    await control.screenshot({ path: path.join(OUT, 'options-dark.png'), fullPage: true });

    await send(control, { type: 'settings.update', patch: { theme: 'light', waitSeconds: 1 } });
    const tab = await harness.context.newPage();
    await tab.setViewportSize({ width: 1000, height: 820 });
    await tab
      .goto(`http://site-a.localhost:${site.port}/`, { waitUntil: 'commit' })
      .catch(() => undefined);
    await expect(tab.locator('#proceed')).toBeEnabled({ timeout: 15_000 });
    await tab.screenshot({ path: path.join(OUT, 'blocked-light.png') });

    await send(control, { type: 'settings.update', patch: { theme: 'dark' } });
    const darkTab = await harness.context.newPage();
    await darkTab.setViewportSize({ width: 1000, height: 820 });
    await darkTab
      .goto(`http://site-a.localhost:${site.port}/again`, { waitUntil: 'commit' })
      .catch(() => undefined);
    await expect(darkTab.locator('#proceed')).toBeEnabled({ timeout: 15_000 });
    await darkTab.screenshot({ path: path.join(OUT, 'blocked-dark.png') });
  } finally {
    await harness.context.close();
    await site.close();
  }
});
