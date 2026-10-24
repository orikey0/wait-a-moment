import type { BlockView, BlockWordView } from '../shared/messages';
import { errorMessages, strings } from '../shared/strings';
import type { Mark } from '../shared/types';
import { CLOCK_TOLERANCE_MS } from '../core/timing';
import { MOVE_RADIUS_PX, nextSpot, offsetPx, type Spot } from '../core/motion';
import { byId, el, localize } from './dom';
import { send } from './messaging';
import { applyTheme, prefersReducedMotion } from './theme';

const TICK_MS = 250;
const MARKS: readonly Mark[] = ['know', 'unknown', 'review'];
const blockId = new URLSearchParams(location.search).get('block') ?? '';
const doneUrl = chrome.runtime.getURL('done.html');

const hostLabel = byId('target-host');
const countdown = byId('countdown');
const progress = byId('progress');
const progressBar = byId('progress-bar');
const gate = byId('gate');
const abandonButton = byId<HTMLButtonElement>('abandon');
const proceedButton = byId<HTMLButtonElement>('proceed');
const playfield = byId('playfield');
const durations = byId('durations');
const durationButtons = byId('duration-buttons');
const errorText = byId('error');
const goTarget = byId<HTMLAnchorElement>('go-target');
const unavailable = byId('unavailable');
const wordsSection = byId('words');
const wordList = byId('word-list');
const closeWordsButton = byId<HTMLButtonElement>('close-words');
const announcer = byId('sr-announce');

let view: BlockView | null = null;
let revealed = false;
let announced = false;
let syncing = false;
let movable = false;
let pressed = false;
let spot: Spot = { fx: 0.5, fy: 0.5 };

async function start(): Promise<void> {
  localize(document.body);
  if (!blockId) {
    showUnavailable();
    return;
  }
  const reply = await send({ type: 'block.get', blockId });
  if (!reply.ok) {
    showUnavailable();
    return;
  }
  view = reply.block;
  applyTheme(reply.block.theme);
  hostLabel.textContent = reply.block.host;
  renderWords(reply.block);

  if (reply.block.outcome !== null) {
    showResolved(reply.block);
    return;
  }

  renderDurations(reply.block.grantMinutes);
  setupMovement(reply.block);
  abandonButton.addEventListener('click', () => void abandon());
  proceedButton.addEventListener('click', reveal);
  closeWordsButton.addEventListener('click', () => {
    wordsSection.hidden = true;
  });
  void send({ type: 'block.shown', blockId });
  tick();
  window.setInterval(tick, TICK_MS);
}

/**
 * The countdown is computed from wall-clock timestamps, so throttled background tabs and page
 * reloads show the right remaining time. If the clock was set back, the service worker restarts
 * the wait and the page picks up the new start time.
 */
function tick(): void {
  const current = view;
  if (!current || revealed) return;
  const remaining = current.waitStartedAt + current.waitMs - Date.now();
  if (remaining > current.waitMs + CLOCK_TOLERANCE_MS) {
    void resync();
    return;
  }

  const ready = remaining <= 0;
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  const percent =
    current.waitMs === 0
      ? 100
      : Math.round(Math.min(1, Math.max(0, 1 - remaining / current.waitMs)) * 100);
  countdown.textContent = ready ? strings.countdownDone : strings.countdown(seconds);
  progressBar.style.width = `${percent}%`;
  progress.setAttribute('aria-valuenow', String(percent));
  proceedButton.textContent = ready ? strings.proceed : strings.proceedWaiting(seconds);
  proceedButton.disabled = !ready;
  if (ready && !announced) {
    announced = true;
    announcer.textContent = strings.waitDone;
  }
}

async function resync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const reply = await send({ type: 'block.get', blockId });
    if (reply.ok) {
      view = reply.block;
    } else {
      showUnavailable();
    }
  } finally {
    syncing = false;
  }
}

function reveal(): void {
  revealed = true;
  movable = false;
  proceedButton.dataset.movable = 'false';
  proceedButton.style.left = '';
  proceedButton.style.top = '';
  proceedButton.disabled = true;
  proceedButton.setAttribute('aria-expanded', 'true');
  durations.hidden = false;
  durationButtons.querySelector<HTMLButtonElement>('button')?.focus();
}

function renderDurations(minutesList: number[]): void {
  durationButtons.replaceChildren(
    ...minutesList.map((minutes) =>
      el('button', {
        className: 'btn btn-primary chip',
        attrs: { type: 'button' },
        text: strings.grantOption(minutes),
        on: { click: () => void grant(minutes) },
      }),
    ),
  );
}

async function grant(minutes: number): Promise<void> {
  setBusy(true);
  const reply = await send({ type: 'block.grant', blockId, minutes });
  if (reply.ok) {
    location.replace(reply.targetUrl);
    return;
  }
  setBusy(false);
  if (reply.error === 'wait_pending') void resync();
  showError(errorMessages[reply.error]);
}

async function abandon(): Promise<void> {
  setBusy(true);
  proceedButton.disabled = true;
  const reply = await send({ type: 'block.abandon', blockId });
  // Return to the last page that was not under a rule. Only if there is none, show the neutral page.
  const returnUrl = reply.ok ? reply.returnUrl : null;
  location.replace(returnUrl ?? doneUrl);
}

function setBusy(busy: boolean): void {
  abandonButton.disabled = busy;
  for (const button of durationButtons.querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = busy;
  }
}

function showError(message: string): void {
  errorText.textContent = message;
  errorText.hidden = false;
}

function showResolved(current: BlockView): void {
  abandonButton.disabled = true;
  proceedButton.disabled = true;
  countdown.textContent = strings.alreadyResolved;
  if (current.outcome === 'granted') {
    goTarget.href = current.targetUrl;
    goTarget.hidden = false;
  }
}

function showUnavailable(): void {
  gate.hidden = true;
  wordsSection.hidden = true;
  unavailable.hidden = false;
}

function setupMovement(current: BlockView): void {
  const motionAllowed =
    current.motion === 'full' || (current.motion === 'system' && !prefersReducedMotion());
  movable = current.moveButtons && motionAllowed;
  proceedButton.dataset.movable = String(movable);
  if (!movable) return;

  place();
  document.addEventListener('pointermove', onPointerMove);
  // A press in progress never moves the button, so a click that has already started always lands.
  proceedButton.addEventListener('pointerdown', () => {
    pressed = true;
  });
  window.addEventListener('pointerup', () => {
    pressed = false;
  });
  window.addEventListener('pointercancel', () => {
    pressed = false;
  });
  window.addEventListener('resize', place);
}

function onPointerMove(event: PointerEvent): void {
  if (!movable || pressed || proceedButton.disabled) return;
  // Keyboard users keep a stable target: a focused button never moves.
  if (document.activeElement === proceedButton) return;
  const rect = proceedButton.getBoundingClientRect();
  const distance = Math.hypot(
    event.clientX - (rect.left + rect.width / 2),
    event.clientY - (rect.top + rect.height / 2),
  );
  if (distance > MOVE_RADIUS_PX) return;
  spot = nextSpot(spot, Math.random);
  place();
}

/** Keeps the button inside the play field for any window size. */
function place(): void {
  const maxX = playfield.clientWidth - proceedButton.offsetWidth;
  const maxY = playfield.clientHeight - proceedButton.offsetHeight;
  proceedButton.style.left = `${offsetPx(maxX, spot.fx)}px`;
  proceedButton.style.top = `${offsetPx(maxY, spot.fy)}px`;
}

function renderWords(current: BlockView): void {
  if (!current.wordsEnabled) {
    wordsSection.hidden = true;
    return;
  }
  wordsSection.hidden = false;
  if (current.words.length === 0) {
    wordList.replaceChildren(el('p', { className: 'help', text: strings.noWords }));
    return;
  }
  wordList.replaceChildren(...current.words.map((word) => wordCard(word)));
}

function wordCard(word: BlockWordView): HTMLElement {
  const status = el('p', { className: 'word-status' });
  const card = el('li', { className: 'word-card' }, [
    el('div', { className: 'word-head' }, [
      el('strong', { text: word.word }),
      el('span', { className: 'word-meaning', text: word.meaning }),
    ]),
    el(
      'div',
      { className: 'word-actions' },
      MARKS.map((mark) =>
        el('button', {
          className: 'btn btn-small',
          attrs: { type: 'button' },
          text: strings.markLabel(mark),
          on: { click: () => void markWord(card, word.id, mark) },
        }),
      ),
    ),
    status,
  ]);
  if (word.mark) setMarked(card, word.mark);
  return card;
}

async function markWord(card: HTMLElement, wordId: string, mark: Mark): Promise<void> {
  const reply = await send({ type: 'block.markWord', blockId, wordId, mark });
  if (reply.ok) {
    setMarked(card, mark);
    return;
  }
  showError(errorMessages[reply.error]);
}

function setMarked(card: HTMLElement, mark: Mark): void {
  for (const button of card.querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = true;
  }
  const status = card.querySelector('.word-status');
  if (status) status.textContent = strings.markedAs(strings.markLabel(mark));
}

void start();
