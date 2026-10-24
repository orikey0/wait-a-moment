import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MEMO_LENGTH,
  MAX_TASKS_PER_DAY,
  MEMO_RETENTION_DAYS,
  addTask,
  carryUnfinished,
  countDone,
  isMemoTask,
  normalizeMemoText,
  pruneTasks,
  removeTask,
  setTaskDone,
  tasksForDay,
} from '../../src/core/memos';
import type { MemoTask } from '../../src/shared/types';

const TODAY = '2026-10-24';
const YESTERDAY = '2026-10-23';

function task(id: string, day: string, overrides: Partial<MemoTask> = {}): MemoTask {
  return { id, text: `任务 ${id}`, day, done: false, createdAt: 1, ...overrides };
}

describe('memo text', () => {
  it('trims the text and rejects empty, over-long and control-character input', () => {
    assert.deepEqual(normalizeMemoText('  写周报  '), { ok: true, text: '写周报' });
    assert.deepEqual(normalizeMemoText('   '), { ok: false, error: 'empty' });
    assert.deepEqual(normalizeMemoText('a'.repeat(MAX_MEMO_LENGTH + 1)), {
      ok: false,
      error: 'too_long',
    });
    assert.deepEqual(normalizeMemoText('ab\u0007c'), { ok: false, error: 'control_character' });
    assert.equal(normalizeMemoText('a'.repeat(MAX_MEMO_LENGTH)).ok, true);
  });
});

describe('adding, ticking and removing tasks', () => {
  it('adds an unfinished task to the given day', () => {
    const result = addTask([], { text: '读论文', day: TODAY, id: 'a', now: 100 });
    assert.ok(result.ok);
    assert.deepEqual(result.task, {
      id: 'a',
      text: '读论文',
      day: TODAY,
      done: false,
      createdAt: 100,
    });
  });

  it('limits the number of tasks per day, not the whole list', () => {
    const full = Array.from({ length: MAX_TASKS_PER_DAY }, (_, index) => task(`t${index}`, TODAY));
    assert.deepEqual(addTask(full, { text: '超出的一项', day: TODAY, id: 'x', now: 2 }), {
      ok: false,
      error: 'too_many_tasks',
    });
    assert.equal(addTask(full, { text: '明天的事', day: '2026-10-25', id: 'x', now: 2 }).ok, true);
  });

  it('marks a task done with a timestamp, and clears it again when unticked', () => {
    const done = setTaskDone([task('a', TODAY)], 'a', true, 500);
    assert.ok(done.ok);
    const marked = done.tasks.find((item) => item.id === 'a');
    assert.ok(marked);
    assert.equal(marked.done, true);
    assert.equal(marked.doneAt, 500);

    const undone = setTaskDone(done.tasks, 'a', false, 600);
    assert.ok(undone.ok);
    const cleared = undone.tasks.find((item) => item.id === 'a');
    assert.ok(cleared);
    assert.equal(cleared.done, false);
    assert.equal(cleared.doneAt, undefined);
  });

  it('reports unknown ids instead of changing anything', () => {
    assert.deepEqual(setTaskDone([task('a', TODAY)], 'zzz', true, 1), {
      ok: false,
      error: 'not_found',
    });
    assert.deepEqual(removeTask([task('a', TODAY)], 'zzz'), { ok: false, error: 'not_found' });
  });

  it('removes a task by id and keeps the others', () => {
    const result = removeTask([task('a', TODAY), task('b', TODAY)], 'a');
    assert.ok(result.ok);
    assert.deepEqual(
      result.tasks.map((item) => item.id),
      ['b'],
    );
  });
});

describe('listing and carrying over', () => {
  it('lists one day in the order the tasks were added', () => {
    const tasks = [
      task('late', TODAY, { createdAt: 30 }),
      task('other', YESTERDAY, { createdAt: 5 }),
      task('early', TODAY, { createdAt: 10 }),
    ];
    assert.deepEqual(
      tasksForDay(tasks, TODAY).map((item) => item.id),
      ['early', 'late'],
    );
  });

  it('copies only the unfinished tasks to today, and skips texts already there', () => {
    const tasks = [
      task('y1', YESTERDAY, { text: '读论文', done: true, createdAt: 1 }),
      task('y2', YESTERDAY, { text: '买菜', createdAt: 2 }),
      task('y3', YESTERDAY, { text: '回邮件', createdAt: 3 }),
      task('t1', TODAY, { text: '回邮件', createdAt: 4 }),
    ];
    const result = carryUnfinished(tasks, YESTERDAY, TODAY, () => 'new', 1000);
    assert.equal(result.added, 1);
    const today = tasksForDay(result.tasks, TODAY);
    assert.deepEqual(
      today.map((item) => [item.text, item.done]),
      [
        ['回邮件', false],
        ['买菜', false],
      ],
    );
    assert.equal(today[1]?.id, 'new');
  });
});

describe('retention and summaries', () => {
  it(`keeps ${MEMO_RETENTION_DAYS} days of history and drops anything older`, () => {
    // 2026-08-26 is 59 days before 2026-10-24, so it is the oldest day kept.
    const tasks = [task('old', '2026-08-25'), task('edge', '2026-08-26'), task('today', TODAY)];
    assert.deepEqual(
      pruneTasks(tasks, TODAY).map((item) => item.id),
      ['edge', 'today'],
    );
  });

  it('counts finished tasks', () => {
    assert.equal(countDone([task('a', TODAY, { done: true }), task('b', TODAY)]), 1);
  });
});

describe('stored memo shape', () => {
  it('accepts well-formed tasks and rejects damaged ones', () => {
    assert.equal(isMemoTask(task('a', TODAY)), true);
    assert.equal(isMemoTask(task('a', TODAY, { done: true, doneAt: 5 })), true);
    assert.equal(isMemoTask(task('a', '24-10-2026')), false);
    assert.equal(isMemoTask(task('a', TODAY, { text: '   ' })), false);
    const broken = { ...task('a', TODAY), done: 'yes' };
    assert.equal(isMemoTask(broken), false);
    assert.equal(isMemoTask(null), false);
  });
});
