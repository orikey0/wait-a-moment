import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { dayKey, summarize } from '../../src/core/stats';
import type { Settings } from '../../src/shared/types';
import { launchHarness, send, snapshotOf, startSite, type Harness, type Site } from './harness';

let site: Site;
let harness: Harness;
let control: Page;
let profileDir = '';

test.beforeAll(async () => {
  site = await startSite();
});

test.afterAll(async () => {
  await site.close();
});

test.beforeEach(async () => {
  profileDir = path.join('test-results', `profile-${randomUUID()}`);
  harness = await launchHarness(profileDir);
  control = await harness.openExtensionPage('options.html');
});

test.afterEach(async () => {
  await harness.context.close();
});

function siteUrl(host: string, route = '/'): string {
  return `http://${host}.localhost:${site.port}${route}`;
}

async function addRule(host: string): Promise<void> {
  const reply = await send(control, {
    type: 'rules.add',
    input: `${host}.localhost`,
    includeSubdomains: true,
  });
  expect(reply.ok).toBe(true);
}

async function configure(patch: Partial<Settings>): Promise<void> {
  const reply = await send(control, { type: 'settings.update', patch });
  expect(reply.ok).toBe(true);
}

/**
 * Navigates a tab to a controlled site and waits for the interception page. The navigation to the
 * site is cancelled by the extension, so the check polls the URL instead of waiting for a load event.
 */
async function openBlocked(tab: Page, url: string): Promise<void> {
  await tab.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
  await expect(tab).toHaveURL(/blocked\.html\?block=/);
}

/**
 * Activates "等待后浏览" from the keyboard. Focus stops the button from moving, so the click lands;
 * a pointer click would be chasing a button that is designed to move away from the cursor.
 */
async function grantAfterWait(tab: Page, minutes: number): Promise<void> {
  const proceed = tab.locator('#proceed');
  await expect(proceed).toBeEnabled({ timeout: 15_000 });
  await proceed.focus();
  await tab.keyboard.press('Enter');
  await tab.getByRole('button', { name: `放行 ${minutes} 分钟`, exact: true }).click();
}

test('first run seeds the example sites, the sample words and the default wait', async () => {
  const snapshot = await snapshotOf(control);
  expect(snapshot.rules.map((rule) => rule.host).sort()).toEqual([
    'tophub.today',
    'v2ex.com',
    'x.com',
    'zhihu.com',
  ]);
  expect(snapshot.words.length).toBeGreaterThanOrEqual(40);
  expect(snapshot.settings.waitSeconds).toBe(10);
});

test('blocks a controlled site and keeps "等待后浏览" disabled during the wait', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 3 });
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));

  await expect(tab.locator('#target-host')).toHaveText('site-a.localhost');
  await expect(tab.locator('#proceed')).toBeDisabled();
  await expect(tab.locator('#countdown')).toContainText('还需等待');
});

test('does not interfere with pages that no rule matches', async () => {
  await addRule('site-a');
  const tab = await harness.context.newPage();
  await tab.goto(siteUrl('open', '/plain'));
  await expect(tab).toHaveURL(siteUrl('open', '/plain'));
  await expect(tab).toHaveTitle('Open page');
});

test('"本次不浏览" never reaches the site and returns to the last normal page', async () => {
  await addRule('site-a');
  const tab = await harness.context.newPage();
  await tab.goto(siteUrl('open', '/start'));
  await expect(tab).toHaveTitle('Open page');

  await openBlocked(tab, siteUrl('site-a', '/private'));
  await tab.getByRole('button', { name: '本次不浏览', exact: true }).click();

  await expect(tab).toHaveURL(siteUrl('open', '/start'));
  await expect(tab).toHaveTitle('Open page');
});

test('a grant opens the site after the wait, and other tabs of the same rule are not blocked', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 2 });
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a', '/one'));
  await grantAfterWait(tab, 1);

  await expect(tab).toHaveURL(siteUrl('site-a', '/one'));
  await expect(tab).toHaveTitle('Site A');

  const other = await harness.context.newPage();
  await other.goto(siteUrl('site-a', '/two'));
  await expect(other).toHaveTitle('Site A');
});

test('the proceed button moves away from the pointer but stays inside its play field', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 0, moveButtons: true, motion: 'full' });
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));

  const proceed = tab.locator('#proceed');
  const playfield = tab.locator('#playfield');
  await expect(proceed).toBeEnabled();
  const before = await proceed.boundingBox();
  const field = await playfield.boundingBox();
  if (!before || !field) throw new Error('proceed button or play field is not laid out');

  // Approach from the side, without pressing.
  await tab.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2);
  await expect.poll(async () => (await proceed.boundingBox())?.x).not.toBe(before.x);

  const after = await proceed.boundingBox();
  if (!after) throw new Error('proceed button disappeared');
  expect(after.x).toBeGreaterThanOrEqual(field.x);
  expect(after.y).toBeGreaterThanOrEqual(field.y);
  expect(after.x + after.width).toBeLessThanOrEqual(field.x + field.width);
  expect(after.y + after.height).toBeLessThanOrEqual(field.y + field.height);
});

test('a word mark is counted once, even after the page is reloaded', async () => {
  await addRule('site-a');
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));
  await expect(tab.locator('#words')).toBeVisible();

  const firstCard = tab.locator('.word-card').first();
  await firstCard.getByRole('button', { name: '认识', exact: true }).click();
  await expect(firstCard.locator('.word-status')).toContainText('已记录');

  await tab.reload();
  await expect(tab.locator('.word-card').first().locator('.word-status')).toContainText('已记录');

  const snapshot = await snapshotOf(control);
  expect(snapshot.stats.days[dayKey(Date.now())]?.wordActions).toBe(1);
});

test('statistics match a known sequence of abandon, grant and word actions', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 2 });

  const first = await harness.context.newPage();
  await openBlocked(first, siteUrl('site-a', '/a'));
  await first.getByRole('button', { name: '本次不浏览', exact: true }).click();
  await expect(first).toHaveTitle('已取消本次访问');

  const second = await harness.context.newPage();
  await openBlocked(second, siteUrl('site-a', '/b'));
  await second
    .locator('.word-card')
    .first()
    .getByRole('button', { name: '不认识', exact: true })
    .click();
  await grantAfterWait(second, 2);
  await expect(second).toHaveTitle('Site A');

  const snapshot = await snapshotOf(control);
  const today = dayKey(Date.now());
  const totals = summarize(snapshot.stats, today, today);
  expect(totals).toEqual({
    shown: 2,
    abandoned: 1,
    granted: 1,
    grantedMinutes: 2,
    wordActions: 1,
  });
  expect(snapshot.stats.days[today]?.sites['site-a.localhost']).toEqual({
    shown: 2,
    abandoned: 1,
    granted: 1,
    grantedMinutes: 2,
  });
});

test('a setting change applies to the next interception without reinstalling', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 60 });
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));
  await expect(tab.locator('#countdown')).toContainText('还需等待');
  await tab.close();

  await configure({ waitSeconds: 0 });
  const next = await harness.context.newPage();
  await openBlocked(next, siteUrl('site-a', '/again'));
  await expect(next.locator('#proceed')).toBeEnabled();
  await expect(next.locator('#countdown')).toHaveText('可以选择了');
});

test('pausing interception and removing a rule take effect at once', async () => {
  await addRule('site-a');
  await configure({ paused: true });
  const paused = await harness.context.newPage();
  await paused.goto(siteUrl('site-a'));
  await expect(paused).toHaveTitle('Site A');

  await configure({ paused: false });
  const snapshot = await snapshotOf(control);
  const rule = snapshot.rules.find((candidate) => candidate.host === 'site-a.localhost');
  if (!rule) throw new Error('site-a rule missing');
  const removed = await send(control, { type: 'rules.remove', id: rule.id });
  expect(removed.ok).toBe(true);

  const open = await harness.context.newPage();
  await open.goto(siteUrl('site-a', '/after-removal'));
  await expect(open).toHaveTitle('Site A');
});

test('rules survive a browser restart, but waits do not: an old interception page reports it expired', async () => {
  await addRule('site-a');
  await configure({ waitSeconds: 60 });
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));
  const blockedUrl = tab.url();

  await harness.context.close();
  harness = await launchHarness(profileDir);
  control = await harness.openExtensionPage('options.html');
  const snapshot = await snapshotOf(control);
  expect(snapshot.rules.map((rule) => rule.host)).toContain('site-a.localhost');

  const restored = await harness.context.newPage();
  await restored.goto(blockedUrl);
  await expect(restored.locator('#unavailable')).toBeVisible();
});
