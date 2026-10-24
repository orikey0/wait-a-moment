import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchHarness, send, startSite, type Harness, type Site } from './harness';

const ROUNDS = 10;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

// Measures how much the interception adds to a navigation. Times come from Playwright's clock,
// so they include some test-driver overhead; read them as an order of magnitude, not a benchmark.
test('interception adds little latency to a navigation', async () => {
  const site: Site = await startSite();
  const harness: Harness = await launchHarness(
    path.join('test-results', `profile-${randomUUID()}`),
  );
  try {
    const control = await harness.openExtensionPage('options.html');
    const reply = await send(control, {
      type: 'rules.add',
      input: 'site-a.localhost',
      includeSubdomains: true,
    });
    expect(reply.ok).toBe(true);

    const plain: number[] = [];
    const blocked: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const tab = await harness.context.newPage();

      let started = Date.now();
      await tab.goto(`http://open.localhost:${site.port}/p${round}`);
      plain.push(Date.now() - started);

      started = Date.now();
      await tab
        .goto(`http://site-a.localhost:${site.port}/b${round}`, { waitUntil: 'commit' })
        .catch(() => undefined);
      await tab.locator('#gate').waitFor();
      blocked.push(Date.now() - started);

      await tab.close();
    }

    const summary = {
      rounds: ROUNDS,
      plainMedianMs: median(plain),
      blockedMedianMs: median(blocked),
      addedMedianMs: median(blocked) - median(plain),
    };
    console.log('interception latency:', JSON.stringify(summary));
    expect(summary.addedMedianMs).toBeLessThan(1_000);
  } finally {
    await harness.context.close();
    await site.close();
  }
});
