import { buildBackup } from '../core/backup';
import { parseGrantMinutes } from '../core/settings';
import {
  abandonRatio,
  dailySeries,
  dayKey,
  shiftDay,
  siteBreakdown,
  statsToCsv,
  summarize,
  type DailyPoint,
  type Totals,
} from '../core/stats';
import type { Snapshot, WordView } from '../shared/messages';
import { csvIssueMessage, errorMessages, strings } from '../shared/strings';
import type { Motion, Settings, SiteRule, StatsData, Theme, WordEntry } from '../shared/types';
import { byId, el, localize } from './dom';
import { send } from './messaging';
import { applyTheme } from './theme';

const TREND_DAYS = 7;
const SITE_WINDOW_DAYS = 30;
const MAX_ISSUES_SHOWN = 5;

const METRICS: ReadonlyArray<{ label: string; value: (totals: Totals) => string }> = [
  { label: strings.statsShown, value: (totals) => String(totals.shown) },
  { label: strings.statsAbandoned, value: (totals) => String(totals.abandoned) },
  { label: strings.statsGranted, value: (totals) => String(totals.granted) },
  { label: strings.statsRatio, value: (totals) => formatRatio(abandonRatio(totals)) },
  { label: strings.statsMinutes, value: (totals) => String(totals.grantedMinutes) },
  { label: strings.statsWords, value: (totals) => String(totals.wordActions) },
];

let snapshot: Snapshot | null = null;

async function load(): Promise<void> {
  const reply = await send({ type: 'admin.snapshot' });
  const banner = byId('store-banner');
  if (!reply.ok) {
    banner.textContent = strings.storeError;
    banner.hidden = false;
    return;
  }
  banner.hidden = true;
  snapshot = reply.snapshot;
  render(reply.snapshot);
}

function render(current: Snapshot): void {
  const today = dayKey(current.now);
  applyTheme(current.settings.theme);
  byId<HTMLInputElement>('paused').checked = current.settings.paused;
  renderRules(current.rules);
  renderWaitForm(current.settings);
  renderWords(current.words, current.settings, current.now);
  renderStats(current.stats, current.settings, today);
}

// Site rules

function renderRules(rules: SiteRule[]): void {
  const list = byId('rule-list');
  if (rules.length === 0) {
    list.replaceChildren(el('li', { className: 'empty', text: strings.ruleEmpty }));
    return;
  }
  list.replaceChildren(...rules.map((rule) => ruleRow(rule)));
}

function ruleRow(rule: SiteRule): HTMLElement {
  const scope =
    rule.pathPrefix === '/' ? strings.ruleScopeSite : strings.ruleScopePath(rule.pathPrefix);

  const enabledBox = el('input', {
    attrs: { type: 'checkbox', 'aria-label': `${strings.ruleEnabled} ${rule.host}` },
  });
  enabledBox.checked = rule.enabled;
  enabledBox.addEventListener('change', () => {
    void updateRule(rule.id, { enabled: enabledBox.checked });
  });

  const subdomainBox = el('input', {
    attrs: { type: 'checkbox', 'aria-label': `${strings.ruleSubdomains} ${rule.host}` },
  });
  subdomainBox.checked = rule.includeSubdomains;
  subdomainBox.addEventListener('change', () => {
    void updateRule(rule.id, { includeSubdomains: subdomainBox.checked });
  });

  return el('li', { className: 'rule-row' }, [
    el('div', { className: 'rule-main' }, [
      el('strong', { text: rule.host }),
      el('span', { className: 'muted', text: scope }),
      el('span', {
        className: 'badge',
        text: rule.includeSubdomains ? strings.ruleSubdomainsOn : strings.ruleSubdomainsOff,
      }),
    ]),
    el('label', { className: 'inline' }, [enabledBox, strings.ruleEnabled]),
    el('label', { className: 'inline' }, [subdomainBox, strings.ruleSubdomains]),
    el('button', {
      className: 'btn btn-small btn-danger',
      attrs: { type: 'button' },
      text: strings.ruleDelete,
      on: { click: () => void removeRule(rule) },
    }),
  ]);
}

async function updateRule(
  id: string,
  patch: { enabled?: boolean; includeSubdomains?: boolean },
): Promise<void> {
  const reply = await send({ type: 'rules.update', id, ...patch });
  if (!reply.ok) feedback('rule-feedback', errorMessages[reply.error], true);
  await load();
}

async function removeRule(rule: SiteRule): Promise<void> {
  if (!window.confirm(strings.confirmDeleteRule)) return;
  const reply = await send({ type: 'rules.remove', id: rule.id });
  feedback('rule-feedback', reply.ok ? strings.ruleDeleted : errorMessages[reply.error], !reply.ok);
  await load();
}

async function addRule(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const input = byId<HTMLInputElement>('rule-input');
  const includeSubdomains = byId<HTMLInputElement>('rule-subdomains').checked;
  const reply = await send({ type: 'rules.add', input: input.value, includeSubdomains });
  if (!reply.ok) {
    feedback('rule-feedback', errorMessages[reply.error], true);
    return;
  }
  input.value = '';
  feedback('rule-feedback', strings.ruleAdded);
  await load();
}

// Waiting and granting

function renderWaitForm(settings: Settings): void {
  byId<HTMLInputElement>('wait-seconds').value = String(settings.waitSeconds);
  byId<HTMLInputElement>('grant-minutes').value = settings.grantMinutes.join(', ');
  byId<HTMLInputElement>('move-buttons').checked = settings.moveButtons;
  byId<HTMLSelectElement>('motion').value = settings.motion;
  byId<HTMLSelectElement>('theme').value = settings.theme;
}

async function saveWait(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const waitInput = byId<HTMLInputElement>('wait-seconds');
  const minutes = parseGrantMinutes(byId<HTMLInputElement>('grant-minutes').value);
  if (waitInput.value.trim() === '' || !minutes) {
    feedback('wait-feedback', errorMessages.invalid_settings, true);
    return;
  }
  const theme = byId<HTMLSelectElement>('theme').value as Theme;
  const motion = byId<HTMLSelectElement>('motion').value as Motion;
  applyTheme(theme);
  await patchSettings(
    {
      waitSeconds: Number(waitInput.value),
      grantMinutes: minutes,
      moveButtons: byId<HTMLInputElement>('move-buttons').checked,
      motion,
      theme,
    },
    'wait-feedback',
  );
}

async function patchSettings(patch: Partial<Settings>, target: string): Promise<void> {
  const reply = await send({ type: 'settings.update', patch });
  if (!reply.ok) {
    feedback(target, errorMessages[reply.error], true);
    return;
  }
  feedback(target, strings.saved);
  await load();
}

// Words

function renderWords(words: WordView[], settings: Settings, now: number): void {
  byId<HTMLInputElement>('words-enabled').checked = settings.wordsEnabled;
  const fresh = words.filter((word) => word.reviewCount === 0).length;
  const due = words.filter((word) => word.reviewCount > 0 && word.dueAt <= now).length;
  byId('words-summary').textContent = strings.wordsSummary(words.length, due, fresh);
}

async function importWords(): Promise<void> {
  const file = byId<HTMLInputElement>('words-file').files?.[0];
  if (!file) {
    feedback('words-feedback', strings.invalidFile, true);
    return;
  }
  const text = await readUtf8(file);
  if (text === null) {
    feedback('words-feedback', strings.invalidEncoding, true);
    return;
  }
  const reply = await send({ type: 'words.import', text });
  if (!reply.ok) {
    const details = reply.issues?.slice(0, MAX_ISSUES_SHOWN).map(csvIssueMessage).join(' ');
    feedback('words-feedback', details || errorMessages[reply.error], true);
    return;
  }
  feedback('words-feedback', strings.wordsImported(reply.added, reply.existing, reply.duplicates));
  await load();
}

async function restoreSampleWords(): Promise<void> {
  const reply = await send({ type: 'words.restoreSample' });
  feedback(
    'words-feedback',
    reply.ok ? strings.wordsRestored(reply.added) : errorMessages[reply.error],
    !reply.ok,
  );
  await load();
}

async function clearWords(): Promise<void> {
  if (!window.confirm(strings.confirmClearWords)) return;
  const reply = await send({ type: 'words.clear' });
  feedback('words-feedback', reply.ok ? strings.cleared : errorMessages[reply.error], !reply.ok);
  await load();
}

// Statistics

function renderStats(stats: StatsData, settings: Settings, today: string): void {
  byId<HTMLInputElement>('stats-enabled').checked = settings.statsEnabled;
  renderPeriodTable(stats, today);
  renderSites(stats, today);
  renderTrend(stats, today);
}

function renderPeriodTable(stats: StatsData, today: string): void {
  const periods = [
    { label: strings.statsToday, from: today },
    { label: strings.statsWeek, from: shiftDay(today, -6) },
    { label: strings.statsMonth, from: shiftDay(today, -29) },
  ];
  const totals = periods.map((period) => summarize(stats, period.from, today));
  byId('stats-head').replaceChildren(
    el('tr', {}, [
      el('th', { attrs: { scope: 'col' }, text: strings.statsMetric }),
      ...periods.map((period) => el('th', { attrs: { scope: 'col' }, text: period.label })),
    ]),
  );
  byId('stats-rows').replaceChildren(
    ...METRICS.map((metric) =>
      el('tr', {}, [
        el('th', { attrs: { scope: 'row' }, text: metric.label }),
        ...totals.map((total) => el('td', { text: metric.value(total) })),
      ]),
    ),
  );
}

function renderSites(stats: StatsData, today: string): void {
  const rows = siteBreakdown(stats, shiftDay(today, 1 - SITE_WINDOW_DAYS), today);
  const body = byId('sites-rows');
  if (rows.length === 0) {
    body.replaceChildren(
      el('tr', {}, [el('td', { attrs: { colspan: '6' }, text: strings.statsNoData })]),
    );
    return;
  }
  body.replaceChildren(
    ...rows.map((row) =>
      el('tr', {}, [
        el('th', { attrs: { scope: 'row' }, text: row.host }),
        el('td', { text: String(row.shown) }),
        el('td', { text: String(row.abandoned) }),
        el('td', { text: String(row.granted) }),
        el('td', { text: formatRatio(abandonRatio(row)) }),
        el('td', { text: String(row.grantedMinutes) }),
      ]),
    ),
  );
}

/**
 * Seven bars, one series, so one hue and no legend. The bars are decorative: the table beneath
 * carries the same numbers for screen readers. Only the peak day and today get a direct value label.
 */
function renderTrend(stats: StatsData, today: string): void {
  const series = dailySeries(stats, today, TREND_DAYS);
  const peak = Math.max(0, ...series.map((point) => point.shown));
  const plot = byId('trend-plot');
  const tip = byId('trend-tip');
  const columns = series.map((point, index) =>
    trendColumn(point, index === series.length - 1, peak, plot, tip),
  );
  plot.replaceChildren(...columns, tip);
  tip.hidden = true;

  byId('trend-rows').replaceChildren(
    ...series.map((point) =>
      el('tr', {}, [
        el('th', { attrs: { scope: 'row' }, text: point.day }),
        el('td', { text: String(point.shown) }),
        el('td', { text: String(point.abandoned) }),
        el('td', { text: String(point.granted) }),
      ]),
    ),
  );
}

function trendColumn(
  point: DailyPoint,
  isToday: boolean,
  peak: number,
  plot: HTMLElement,
  tip: HTMLElement,
): HTMLElement {
  const showValue = point.shown > 0 && (point.shown === peak || isToday);
  const fill = el('div', { className: 'trend-fill' });
  fill.style.setProperty('--h', String(peak === 0 ? 0 : point.shown / peak));
  const column = el('div', { className: 'trend-col' }, [
    el('span', { className: 'trend-value', text: showValue ? String(point.shown) : '' }),
    el('div', { className: 'trend-area' }, [fill]),
    el('span', { className: 'trend-day', text: point.day.slice(5) }),
  ]);
  column.addEventListener('pointerenter', () => {
    showTip(column, point, plot, tip);
  });
  column.addEventListener('pointerleave', () => {
    tip.hidden = true;
  });
  return column;
}

function showTip(
  column: HTMLElement,
  point: DailyPoint,
  plot: HTMLElement,
  tip: HTMLElement,
): void {
  tip.textContent = strings.trendTip(point.day, point.shown, point.abandoned, point.granted);
  tip.hidden = false;
  const plotBox = plot.getBoundingClientRect();
  const box = column.getBoundingClientRect();
  // Keep the tip inside the plot even for the first and last column.
  const half = tip.offsetWidth / 2;
  const center = box.left - plotBox.left + box.width / 2;
  tip.style.left = `${Math.min(Math.max(center, half), plotBox.width - half)}px`;
  tip.style.top = `${box.top - plotBox.top}px`;
}

// Data

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a', { attrs: { href: url, download: name } });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}

function exportBackup(current: Snapshot): void {
  const words: Record<string, WordEntry> = Object.fromEntries(
    current.words.map(({ id, ...entry }) => [id, entry]),
  );
  const content = buildBackup(
    { rules: current.rules, settings: current.settings, words, stats: current.stats },
    Date.now(),
  );
  download(`wait-a-moment-backup-${dayKey(Date.now())}.json`, content, 'application/json');
}

async function importBackup(): Promise<void> {
  const file = byId<HTMLInputElement>('data-file').files?.[0];
  if (!file) {
    feedback('data-feedback', strings.invalidFile, true);
    return;
  }
  const text = await readUtf8(file);
  if (text === null) {
    feedback('data-feedback', strings.invalidEncoding, true);
    return;
  }
  if (!window.confirm(strings.confirmRestore)) return;
  const reply = await send({ type: 'data.restore', text });
  if (!reply.ok) {
    feedback('data-feedback', errorMessages[reply.error], true);
    return;
  }
  feedback('data-feedback', strings.dataRestored(reply.rules, reply.words));
  await load();
}

async function clearAll(): Promise<void> {
  if (!window.confirm(strings.confirmClearAll)) return;
  const reply = await send({ type: 'data.clear' });
  feedback('data-feedback', reply.ok ? strings.cleared : errorMessages[reply.error], !reply.ok);
  await load();
}

async function clearStats(): Promise<void> {
  if (!window.confirm(strings.confirmClearStats)) return;
  const reply = await send({ type: 'stats.clear' });
  feedback('stats-feedback', reply.ok ? strings.cleared : errorMessages[reply.error], !reply.ok);
  await load();
}

async function readUtf8(file: File): Promise<string | null> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function feedback(id: string, message: string, isError = false): void {
  const node = byId(id);
  node.textContent = message;
  node.dataset.tone = isError ? 'error' : 'ok';
  node.hidden = message === '';
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

function wire(): void {
  byId<HTMLInputElement>('paused').addEventListener('change', (event) => {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    void patchSettings({ paused: checked }, 'pause-feedback');
  });
  byId<HTMLFormElement>('rule-form').addEventListener('submit', (event) => void addRule(event));
  byId<HTMLFormElement>('wait-form').addEventListener('submit', (event) => void saveWait(event));
  byId<HTMLInputElement>('words-enabled').addEventListener('change', (event) => {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    void patchSettings({ wordsEnabled: checked }, 'words-feedback');
  });
  byId('words-import').addEventListener('click', () => void importWords());
  byId('words-restore').addEventListener('click', () => void restoreSampleWords());
  byId('words-clear').addEventListener('click', () => void clearWords());
  byId<HTMLInputElement>('stats-enabled').addEventListener('change', (event) => {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    void patchSettings({ statsEnabled: checked }, 'stats-feedback');
  });
  byId('stats-export-csv').addEventListener('click', () => {
    if (snapshot) {
      download(
        `wait-a-moment-stats-${dayKey(Date.now())}.csv`,
        statsToCsv(snapshot.stats),
        'text/csv',
      );
    }
  });
  byId('stats-export-json').addEventListener('click', () => {
    if (snapshot) {
      download(
        `wait-a-moment-stats-${dayKey(Date.now())}.json`,
        `${JSON.stringify(snapshot.stats, null, 2)}\n`,
        'application/json',
      );
    }
  });
  byId('stats-clear').addEventListener('click', () => void clearStats());
  byId('data-export').addEventListener('click', () => {
    if (snapshot) exportBackup(snapshot);
  });
  byId('data-import').addEventListener('click', () => void importBackup());
  byId('data-clear').addEventListener('click', () => void clearAll());
}

localize(document.body);
wire();
void load();
