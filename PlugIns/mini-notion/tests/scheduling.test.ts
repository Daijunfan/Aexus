import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { createWorkspace } from '../src/seed.ts';
import { duplicatePage } from '../src/model.ts';
import { nextOccurrence, previousOccurrence, repeatOccurrences } from '../src/scheduling/recurrence.ts';
import { evaluateSchedules, reminderDue } from '../src/scheduling/engine.ts';
import type { RepeatRule } from '../src/scheduling/types.ts';
import type { Workspace } from '../src/types.ts';
const rule = (changes: Partial<RepeatRule> = {}): RepeatRule => ({
  id: 'r',
  enabled: true,
  frequency: 'daily',
  interval: 1,
  startDate: '2026-09-01',
  time: '09:00',
  timeZone: 'Asia/Shanghai',
  catchUp: 'latest',
  ...changes,
});
const utc = (value: string) => Date.parse(value);
function fixture() {
  let workspace: Workspace = { ...createWorkspace(), pages: [], activePageId: null };
  const call = (method: string, params: any = {}) => {
    const result = executeWorkspaceCommand(workspace, method, params);
    if (result.changed) workspace = result.workspace!;
    return result.result;
  };
  return {
    call,
    get workspace() {
      return workspace;
    },
    set workspace(value: Workspace) {
      workspace = value;
    },
    tick: (now: number) => {
      const result = evaluateSchedules(workspace, now);
      workspace = result.workspace;
      return result;
    },
  };
}

test('recurrence handles intervals, selected weekdays, month ends, nth weekdays and DST without duplicate local hours', () => {
  const weekly = rule({ frequency: 'weekly', interval: 2, weekdays: [1, 3], startDate: '2026-09-01' });
  assert.deepEqual(
    repeatOccurrences(weekly, utc('2026-08-31T00:00Z'), 3).map((value) => new Date(value).toISOString()),
    ['2026-09-02T01:00:00.000Z', '2026-09-14T01:00:00.000Z', '2026-09-16T01:00:00.000Z'],
  );
  const monthly = rule({ frequency: 'monthly', startDate: '2026-01-31', monthDay: 31 });
  assert.equal(
    new Date(nextOccurrence(monthly, utc('2026-02-01'))!).toISOString(),
    '2026-02-28T01:00:00.000Z',
  );
  const lastFriday = rule({ frequency: 'monthly', monthMode: 'nthWeekday', weekday: 5, ordinal: -1 });
  assert.equal(
    new Date(nextOccurrence(lastFriday, utc('2026-09-01'))!).toISOString(),
    '2026-09-25T01:00:00.000Z',
  );
  assert.equal(nextOccurrence(rule({ endDate: '2026-09-02' }), utc('2026-09-03')), null);
  assert.equal(
    new Date(previousOccurrence(rule({ endDate: '2026-09-02' }), utc('2028-01-01'))!).toISOString(),
    '2026-09-02T01:00:00.000Z',
  );
  const fall = rule({ startDate: '2026-11-01', time: '01:30', timeZone: 'America/New_York' });
  assert.equal(
    new Date(nextOccurrence(fall, utc('2026-11-01T04:00Z'))!).toISOString(),
    '2026-11-01T05:30:00.000Z',
  );
  assert.equal(
    new Date(nextOccurrence(fall, utc('2026-11-01T05:30Z'))!).toISOString(),
    '2026-11-02T06:30:00.000Z',
  );
  const spring = rule({ startDate: '2026-03-08', time: '02:30', timeZone: 'America/New_York' });
  assert.equal(
    new Date(nextOccurrence(spring, utc('2026-03-08T00:00Z'))!).toISOString(),
    '2026-03-08T07:30:00.000Z',
  );
});

test('repeating templates preserve content and relative child dates, remember progress and do not restart after undo or copying', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', {
    columns: [
      { id: 'date', name: '日期', type: 'date' },
      { id: 'end', name: '结束', type: 'date' },
    ],
  });
  const template = call('template.create', {
    databaseId: db.id,
    title: '工作计划',
    blocks: [{ type: 'checkListItem', content: '完成每日检查', props: { checked: false } }],
    values: { date: '2026-09-01', end: '2026-09-03' },
  });
  call('subitem.create', { pageId: template.id, title: '子任务', values: { date: '2026-09-02' } });
  call('repeat.configure', {
    templateId: template.id,
    rule: rule({
      id: undefined as any,
      catchUp: 'all',
      dateProperty: 'date',
      shiftDates: true,
      titlePattern: '计划 {date}',
    }),
  });
  const originalIds = new Set(f.workspace.pages.map((page) => page.id));
  const now = utc('2026-09-03T03:00Z'),
    first = f.tick(now);
  assert.equal(first.runs.length, 3);
  const record = f.workspace.pages.find((page) => page.id === first.runs[2].pageId)!;
  assert.equal(record.title, '计划 2026-09-03');
  assert.equal(record.values.date, '2026-09-03');
  assert.equal(record.values.end, '2026-09-05');
  assert.equal(record.repeat, undefined);
  assert.equal(record.blocks[0].type, 'checkListItem');
  assert.equal(f.workspace.pages.find((page) => page.subItemOf === record.id)!.values.date, '2026-09-04');
  assert.equal(f.tick(now).changed, false);
  f.workspace = { ...f.workspace, pages: f.workspace.pages.filter((page) => originalIds.has(page.id)) };
  assert.equal(f.tick(now).runs.length, 0);
  const copied = duplicatePage(f.workspace, template.id);
  assert.equal(copied.workspace.pages.find((page) => page.id === copied.id)!.repeat!.enabled, false);
});

test('catch-up policies, pause/resume and failed executions remain recoverable without repeated writes', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create');
  const template = call('template.create', { databaseId: db.id, title: '日报' });
  call('repeat.configure', { templateId: template.id, rule: rule({ catchUp: 'latest' }) });
  call('page.update', { pageId: db.id, changes: { locked: true } });
  const now = utc('2026-09-10T03:00Z');
  assert.equal(f.tick(now).runs.length, 0);
  assert.equal(f.tick(now).changed, false);
  assert.match(call('scheduler.status').repeats[0].runtime.error, /锁定/);
  call('page.update', { pageId: db.id, changes: { locked: false } });
  assert.equal(f.tick(now).runs.length, 1);
  call('repeat.pause', { templateId: template.id });
  assert.equal(f.tick(now + 86400000).runs.length, 0);
  call('repeat.resume', { templateId: template.id });
  assert.equal(f.tick(now + 86400000).runs.length, 1);
  call('repeat.configure', { templateId: template.id, rule: { catchUp: 'skip' } });
  assert.equal(f.tick(now + 5 * 86400000).runs.length, 0);
  assert.equal(f.tick(utc('2026-09-16T01:00:10Z')).runs.length, 1);
});

test('date reminders use calendar days across DST, deliver once, snooze and follow changed dates', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', { columns: [{ id: 'date', type: 'date', name: '日期' }] });
  const page = call('record.create', {
    databaseId: db.id,
    title: '检查安排',
    values: { date: '2026-03-08' },
  });
  const reminder = call('reminder.add', {
    pageId: page.id,
    propertyId: 'date',
    offset: 1,
    unit: 'days',
    dayTime: '09:00',
    timeZone: 'America/New_York',
  });
  assert.equal(reminderDue(page, reminder, f.workspace), '2026-03-07T14:00:00.000Z');
  const due = utc('2026-03-07T14:00Z');
  assert.equal(f.tick(due - 1).notifications.length, 0);
  assert.equal(f.tick(due).notifications.length, 1);
  assert.equal(f.tick(due + 5000).changed, false);
  const inbox = call('inbox.list');
  call('inbox.read', { id: inbox[0].id });
  assert.equal(call('inbox.list', { status: 'unread' }).length, 0);
  call('reminder.snooze', {
    pageId: page.id,
    reminderId: reminder.id,
    until: '2099-01-01T09:00Z',
    inboxId: inbox[0].id,
  });
  assert.equal(f.tick(utc('2099-01-01T08:59Z')).notifications.length, 0);
  assert.equal(f.tick(utc('2099-01-01T09:00Z')).notifications.length, 1);
  assert.equal(f.tick(utc('2099-01-01T10:00Z')).notifications.length, 0);
  call('record.update', { pageId: page.id, values: { date: '2099-01-03' } });
  assert.equal(f.tick(utc('2099-01-02T15:00Z')).notifications.length, 1);
  call('reminder.delete', { pageId: page.id, reminderId: reminder.id });
  assert.equal(call('reminder.list', { pageId: page.id }).length, 0);
  call('reminder.restore', { pageId: page.id, reminderId: reminder.id });
  assert.equal(f.tick(utc('2099-01-02T16:00Z')).notifications.length, 0);
});

test('large catch-up batches leave explicit progress and finish without skipping any occurrence', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create'),
    template = call('template.create', { databaseId: db.id, title: '每日记录' });
  call('repeat.configure', {
    templateId: template.id,
    rule: rule({ startDate: '2026-01-01', timeZone: 'UTC', catchUp: 'all' }),
  });
  const first = f.tick(utc('2026-04-13T10:00Z'));
  assert.equal(first.runs.length, 100);
  assert.deepEqual(first.pendingTemplates, [template.id]);
  const second = f.tick(utc('2026-04-13T10:00Z'));
  assert.equal(second.runs.length, 3);
  assert.deepEqual(second.pendingTemplates, []);
  assert.equal(f.tick(utc('2026-04-13T10:00Z')).changed, false);
});
