import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { dayKey, shiftDay } from '../../src/core/stats';
import type { MemoTask } from '../../src/shared/types';
import { launchHarness, send, startSite, type Harness, type Site } from './harness';

let site: Site;
let harness: Harness;
let control: Page;

test.beforeAll(async () => {
  site = await startSite();
});

test.afterAll(async () => {
  await site.close();
});

test.beforeEach(async () => {
  harness = await launchHarness(path.join('test-results', `profile-${randomUUID()}`));
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

/** Opens a controlled site and waits for the interception page, which carries the memo card. */
async function openBlocked(tab: Page, url: string): Promise<void> {
  await tab.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
  await expect(tab).toHaveURL(/blocked\.html\?block=/);
}

test('tasks can be added and ticked on the interception page, and the state survives a reload', async () => {
  await addRule('site-a');
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));

  await tab.locator('#memo-input').fill('写周报');
  await tab.getByRole('button', { name: '添加', exact: true }).click();
  await expect(tab.locator('#memo-today')).toContainText('写周报');

  await tab.getByLabel('写周报', { exact: true }).check();
  await expect(tab.getByLabel('写周报', { exact: true })).toBeChecked();
  await expect(tab.locator('#memo-summary')).toHaveText('已完成 1 / 1');

  await tab.reload();
  await expect(tab.getByLabel('写周报', { exact: true })).toBeChecked();
  await expect(tab.locator('#memo-summary')).toHaveText('已完成 1 / 1');
});

test('a task can be deleted from the list for today', async () => {
  await addRule('site-a');
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));

  await tab.locator('#memo-input').fill('临时的事');
  await tab.getByRole('button', { name: '添加', exact: true }).click();
  await expect(tab.locator('#memo-today')).toContainText('临时的事');

  await tab.getByRole('button', { name: '删除：临时的事' }).click();
  await expect(tab.locator('#memo-today')).not.toContainText('临时的事');
  await expect(tab.locator('#memo-today')).toContainText('今天还没有备忘。');
});

test("yesterday's finished and open tasks are shown, and unfinished ones can be carried over to today", async () => {
  const today = dayKey(Date.now());
  const yesterday = shiftDay(today, -1);
  const memos: MemoTask[] = [
    { id: 'y1', text: '读论文', day: yesterday, done: true, createdAt: 1, doneAt: 2 },
    { id: 'y2', text: '买菜', day: yesterday, done: false, createdAt: 3 },
  ];
  await control.evaluate((data: unknown) => chrome.storage.local.set({ memos: data }), memos);

  await addRule('site-a');
  const tab = await harness.context.newPage();
  await openBlocked(tab, siteUrl('site-a'));

  await tab.locator('#memo-yesterday-panel summary').click();
  await expect(tab.locator('#memo-yesterday-summary')).toHaveText('已完成 1 / 2');
  await expect(tab.locator('#memo-yesterday')).toContainText('读论文');
  await expect(tab.locator('#memo-yesterday')).toContainText('已完成');
  await expect(tab.locator('#memo-yesterday')).toContainText('未完成');

  await tab.getByRole('button', { name: '把未完成的转到今天', exact: true }).click();
  await expect(tab.locator('#memo-today')).toContainText('买菜');
  await expect(tab.locator('#memo-feedback')).toHaveText('已转入 1 项。');
});
