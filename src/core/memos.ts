import type { MemoTask } from '../shared/types';
import { shiftDay } from './stats';

export const MAX_MEMO_LENGTH = 200;
export const MAX_TASKS_PER_DAY = 50;
export const MEMO_RETENTION_DAYS = 60;
export const MAX_MEMO_TASKS = 10_000;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type MemoError = 'empty' | 'too_long' | 'control_character' | 'too_many_tasks' | 'not_found';

export function normalizeMemoText(
  input: string,
): { ok: true; text: string } | { ok: false; error: MemoError } {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'empty' };
  if (text.length > MAX_MEMO_LENGTH) return { ok: false, error: 'too_long' };
  if (/\p{Cc}/u.test(text)) return { ok: false, error: 'control_character' };
  return { ok: true, text };
}

/** The tasks of one local day, in the order they were added. */
export function tasksForDay(tasks: readonly MemoTask[], day: string): MemoTask[] {
  return tasks.filter((task) => task.day === day).sort((a, b) => a.createdAt - b.createdAt);
}

export function addTask(
  tasks: readonly MemoTask[],
  input: { text: string; day: string; id: string; now: number },
): { ok: true; tasks: MemoTask[]; task: MemoTask } | { ok: false; error: MemoError } {
  const normalized = normalizeMemoText(input.text);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  if (tasksForDay(tasks, input.day).length >= MAX_TASKS_PER_DAY) {
    return { ok: false, error: 'too_many_tasks' };
  }
  const task: MemoTask = {
    id: input.id,
    text: normalized.text,
    day: input.day,
    done: false,
    createdAt: input.now,
  };
  return { ok: true, tasks: [...tasks, task], task };
}

export function setTaskDone(
  tasks: readonly MemoTask[],
  id: string,
  done: boolean,
  now: number,
): { ok: true; tasks: MemoTask[] } | { ok: false; error: 'not_found' } {
  if (!tasks.some((task) => task.id === id)) return { ok: false, error: 'not_found' };
  return {
    ok: true,
    tasks: tasks.map((task) => (task.id === id ? markTask(task, done, now) : task)),
  };
}

function markTask(task: MemoTask, done: boolean, now: number): MemoTask {
  if (done) return { ...task, done: true, doneAt: now };
  return { id: task.id, text: task.text, day: task.day, done: false, createdAt: task.createdAt };
}

export function removeTask(
  tasks: readonly MemoTask[],
  id: string,
): { ok: true; tasks: MemoTask[] } | { ok: false; error: 'not_found' } {
  if (!tasks.some((task) => task.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, tasks: tasks.filter((task) => task.id !== id) };
}

/**
 * Copies the unfinished tasks of one day onto another day. A task whose text is already on the
 * target day is skipped, and so is anything beyond the per-day limit.
 */
export function carryUnfinished(
  tasks: readonly MemoTask[],
  fromDay: string,
  toDay: string,
  makeId: () => string,
  now: number,
): { tasks: MemoTask[]; added: number } {
  const next = [...tasks];
  const present = new Set(tasksForDay(tasks, toDay).map((task) => task.text));
  let added = 0;
  for (const task of tasksForDay(tasks, fromDay)) {
    if (task.done || present.has(task.text)) continue;
    if (tasksForDay(next, toDay).length >= MAX_TASKS_PER_DAY) break;
    next.push({ id: makeId(), text: task.text, day: toDay, done: false, createdAt: now + added });
    present.add(task.text);
    added += 1;
  }
  return { tasks: next, added };
}

/** Drops tasks older than the retention window, so the stored list stays bounded. */
export function pruneTasks(tasks: readonly MemoTask[], todayKey: string): MemoTask[] {
  const oldest = shiftDay(todayKey, 1 - MEMO_RETENTION_DAYS);
  return tasks.filter((task) => task.day >= oldest);
}

export function countDone(tasks: readonly MemoTask[]): number {
  return tasks.filter((task) => task.done).length;
}

export function isMemoTask(value: unknown): value is MemoTask {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Partial<Record<keyof MemoTask, unknown>>;
  return (
    typeof task.id === 'string' &&
    task.id !== '' &&
    typeof task.text === 'string' &&
    normalizeMemoText(task.text).ok &&
    typeof task.day === 'string' &&
    DAY_KEY.test(task.day) &&
    typeof task.done === 'boolean' &&
    typeof task.createdAt === 'number' &&
    (task.doneAt === undefined || typeof task.doneAt === 'number')
  );
}
