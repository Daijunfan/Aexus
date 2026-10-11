import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from '../src/model.ts';
import { createWorkspace } from '../src/seed.ts';
import { timeGridProjection, gridInstant } from '../src/database/timeGrid.ts';
import { makeDateValue } from '../src/database/dateValue.ts';
import { viewPeriod, navigateViewDate } from '../src/database/dates.ts';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import type { DatabaseView } from '../src/types.ts';
const database = () =>
  makePage({
    id: 'db',
    database: {
      view: 'plan',
      columns: [
        { id: 'date', type: 'date', name: '日期' },
        { id: 'done', type: 'checkbox', name: '完成' },
      ],
    },
  });
const view = (changes: Partial<DatabaseView> = {}): DatabaseView => ({
  id: 'hourly',
  name: '小时计划',
  type: 'plan',
  planMode: 'hourWeek',
  timeZone: 'Asia/Shanghai',
  dateAnchor: '2026-09-11',
  calendarBy: 'date',
  ...changes,
});
const row = (id: string, start: string, end?: string, zone = 'Asia/Shanghai') =>
  makePage({ id, parentId: 'db', title: id, values: { date: makeDateValue(start, end, zone) } });

test('hourly layouts convert time zones, split midnight, keep all-day ranges and arrange overlap columns', () => {
  const rows = [
    row('a', '2026-09-11T09:00', '2026-09-11T10:00'),
    row('b', '2026-09-11T09:30', '2026-09-11T10:30'),
    row('c', '2026-09-11T10:15', '2026-09-11T11:00'),
    row('late', '2026-09-11T23:00', '2026-09-12T01:00'),
    row('midnight', '2026-09-10T23:00', '2026-09-11T00:00'),
    row('utc', '2026-09-11T04:00', '2026-09-11T05:00', 'UTC'),
    row('all', '2026-09-10', '2026-09-12'),
    row('point', '2026-09-11T23:45'),
  ];
  const grid = timeGridProjection(database(), view(), rows);
  const day = grid.days.find((day) => day.date === '2026-09-11')!;
  assert.deepEqual(day.allDay, ['all']);
  assert.equal(day.events.find((event) => event.id === 'point')!.hasEnd, false);
  assert.equal(
    grid.days.find((day) => day.date === '2026-09-12')!.events.some((event) => event.id === 'point'),
    false,
  );
  assert.deepEqual(
    day.events
      .filter((event) => ['a', 'b', 'c'].includes(event.id))
      .map((event) => [event.id, event.column, event.columns]),
    [
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ],
  );
  assert.equal(day.events.find((event) => event.id === 'utc')!.minuteStart, 12 * 60);
  assert.equal(
    day.events.some((event) => event.id === 'midnight'),
    false,
  );
  const late = day.events.find((event) => event.id === 'late')!;
  assert.equal(late.continuesAfter, true);
  assert.equal(late.minuteEnd, 1440);
  const next = grid.days.find((day) => day.date === '2026-09-12')!.events[0];
  assert.equal(next.id, 'late');
  assert.equal(next.continuesBefore, true);
  assert.equal(next.minuteEnd, 60);
  assert.equal(next.sourceEnd - next.sourceStart, 2 * 3600000);
});

test('DST days expose 23/25 chronological hours and distinguish the two repeated local times', () => {
  const spring = timeGridProjection(
    database(),
    view({ planMode: 'hourDay', timeZone: 'America/New_York', dateAnchor: '2026-03-08' }),
    [],
  );
  assert.equal(spring.days[0].minutes, 1380);
  assert.equal(
    spring.days[0].hours.some((hour) => hour.label === '02:00'),
    false,
  );
  const fall = timeGridProjection(
    database(),
    view({ planMode: 'hourDay', timeZone: 'America/New_York', dateAnchor: '2026-11-01' }),
    [
      row('first', '2026-11-01T01:15-04:00', '2026-11-01T01:45-04:00', 'America/New_York'),
      row('second', '2026-11-01T01:15-05:00', '2026-11-01T01:45-05:00', 'America/New_York'),
    ],
  );
  assert.equal(fall.days[0].minutes, 1500);
  assert.deepEqual(
    fall.days[0].hours.filter((hour) => hour.label === '01:00').map((hour) => hour.offset),
    ['-04:00', '-05:00'],
  );
  assert.deepEqual(
    fall.days[0].events.map((event) => event.minuteStart),
    [75, 135],
  );
  assert.equal(fall.days[0].events[0].columns, 1);
  assert.equal(gridInstant(fall.days[0], 137) - gridInstant(fall.days[0], 77), 3600000);
});

test('daily/weekly navigation and CLI projection agree on the display zone, dates and hidden completed rows', () => {
  const db = database();
  const v = view({
    planMode: 'hourDay',
    timeZone: 'America/New_York',
    dateAnchor: '2026-09-10',
    planHideCompleted: true,
  });
  db.database!.views = [v];
  db.database!.activeViewId = v.id;
  const a = row('converted', '2026-09-11T09:00', '2026-09-11T10:00');
  const b = row('done', '2026-09-11T10:00', '2026-09-11T11:00');
  b.values.done = true;
  const workspace = { ...createWorkspace(), pages: [db, a, b] };
  const projection = executeWorkspaceCommand(workspace, 'view.render', {
    databaseId: 'db',
    from: '2026-09-10',
    to: '2026-09-10',
  }).result;
  assert.equal(projection.count, 1);
  assert.deepEqual(projection.days, [{ date: '2026-09-10', records: ['converted'] }]);
  assert.equal(projection.timeGrid.days[0].events[0].minuteStart, 21 * 60);
  assert.equal(navigateViewDate(v, 'next').dateAnchor, '2026-09-11');
  assert.deepEqual(viewPeriod(v).dates, ['2026-09-10']);
  const midnight = row('midnight', '2026-09-10T23:00-04:00', '2026-09-11T00:00-04:00', 'America/New_York');
  const boundary = executeWorkspaceCommand({ ...workspace, pages: [db, midnight] }, 'view.render', {
    databaseId: 'db',
    from: '2026-09-11',
    to: '2026-09-11',
  }).result;
  assert.equal(boundary.count, 0);
  assert.equal(viewPeriod(view()).dates.length, 7);
  assert.equal(
    viewPeriod(
      view({ planMode: 'hourDay', timeZone: 'America/New_York', dateAnchor: undefined }),
      new Date('2026-09-11T01:00Z'),
    ).from,
    '2026-09-10',
  );
});
