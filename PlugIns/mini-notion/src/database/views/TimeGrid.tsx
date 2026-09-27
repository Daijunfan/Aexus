import {AppSelect} from '../../components/AppSelect';
import { AppearanceTheme, recordAppearanceStyle } from '../../appearance';
import { useContext, useEffect, useRef, useState } from 'react';
import { Clock, Plus } from 'lucide-react';
import type { DatabaseView, Page } from '../../types';
import { useWorkspace } from '../../store';
import { IconButton, PageIcon } from '../../ui';
import { scheduledRange, parseDay } from '../dates';
import { dateParts, hasTime, makeDateValue, zonedDate } from '../dateValue';
import { gridInstant, timeGridProjection, timeInZone, type TimeGridEvent } from '../timeGrid';

const pixelsPerMinute = 0.9;
type Props = {
  now: Date;
  page: Page;
  view: DatabaseView;
  rows: Page[];
  openRow: (id: string) => void;
  addRow: (values?: Page['values']) => void;
  updateView: (changes: Partial<DatabaseView>) => void;
  isDone: (row: Page) => boolean;
  complete?: (row: Page, done: boolean) => void;
};
export function TimeGrid({ now, page, view, rows, openRow, addRow, updateView, isDone, complete }: Props) {
  const theme = useContext(AppearanceTheme);
  const { command, notify } = useWorkspace();
  const [dropAt, setDropAt] = useState<{ date: string; minute: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; end: number } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const grid = timeGridProjection(page, view, rows, now);
  const allDayHeight = Math.max(42, 18 + Math.max(...grid.days.map((day) => day.allDay.length)) * 27);
  const height = Math.max(...grid.days.map((day) => day.minutes)) * pixelsPerMinute;
  const fields = { startProperty: grid.dateProperty, endProperty: grid.endProperty || '' };
  const rowFor = (id: string) => rows.find((row) => row.id === id);

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 8 * 60 * pixelsPerMinute;
  }, [grid.days[0]?.date, view.planMode, view.timeZone]);
  const execute = (id: string, params: Record<string, unknown>) => {
    const row = rowFor(id);
    if (!row || grid.readonlyDates || row.locked || page.locked) return;
    try {
      command('record.schedule', { pageId: id, ...fields, ...params });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  };
  const move = (id: string, timestamp: number) => {
    const row = rowFor(id);
    if (!row) return;
    const old = dateParts(row.values[grid.dateProperty || '']);
    const range = scheduledRange(row, grid.dateProperty, grid.endProperty || undefined);
    const days =
      range.start && range.end
        ? Math.round((parseDay(range.end)!.getTime() - parseDay(range.start)!.getTime()) / 86400000)
        : 0;
    execute(id, {
      date: timeInZone(timestamp, grid.timeZone),
      timeZone: old?.timeZone || grid.timeZone,
      ...(!old || !hasTime(old.start)
        ? {
            end: days
              ? zonedDate(timeInZone(timestamp, grid.timeZone), grid.timeZone)
                  .add({ days })
                  .toString({ timeZoneName: 'never', smallestUnit: 'minute' })
              : timeInZone(timestamp + 60 * 60000, grid.timeZone),
          }
        : {}),
    });
  };
  const createAt = (timestamp: number) => {
    if (grid.readonlyDates || page.locked || !grid.dateProperty) return;
    const start = timeInZone(timestamp, grid.timeZone),
      end = timeInZone(timestamp + 60 * 60000, grid.timeZone);
    addRow({
      [grid.dateProperty]: makeDateValue(start, grid.endProperty ? undefined : end, grid.timeZone),
      ...(grid.endProperty ? { [grid.endProperty]: makeDateValue(end, undefined, grid.timeZone) } : {}),
    });
  };
  const resizeTo = (event: TimeGridEvent, timestamp: number) => {
    const row = rowFor(event.id);
    execute(event.id, {
      date: event.start,
      end: timeInZone(Math.max(event.sourceStart + 15 * 60000, timestamp), grid.timeZone),
      timeZone: dateParts(row?.values[grid.dateProperty || ''])?.timeZone || grid.timeZone,
    });
  };
  const startResize = (pointer: React.PointerEvent, event: TimeGridEvent, originDay: number) => {
    const row = rowFor(event.id);
    if (pointer.button !== 0 || grid.readonlyDates || row?.locked || page.locked) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    const origin = pointer.clientY;
    const element = pointer.currentTarget;
    element.setPointerCapture(pointer.pointerId);
    setResize({ id: event.id, end: event.sourceEnd });
    let end = event.sourceEnd;
    const movePointer = (next: PointerEvent) => {
      if (next.pointerId !== pointer.pointerId || !(next.buttons & 1)) return;
      const target = grid.days
        .map((day) => ({
          day,
          rect: scroll.current?.querySelector(`[data-time-slots="${day.date}"]`)?.getBoundingClientRect(),
        }))
        .find(
          (target) => target.rect && next.clientX >= target.rect.left && next.clientX < target.rect.right,
        );
      end = Math.max(
        event.sourceStart + 15 * 60000,
        event.sourceEnd +
          Math.round((next.clientY - origin) / pixelsPerMinute / 15) * 15 * 60000 +
          (target ? target.day.startTimestamp - originDay : 0),
      );
      setResize({ id: event.id, end });
    };
    const finish = (ending: PointerEvent) => {
      if (ending.pointerId !== pointer.pointerId) return;
      document.removeEventListener('pointermove', movePointer);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      if (element.hasPointerCapture(pointer.pointerId)) element.releasePointerCapture(pointer.pointerId);
      setResize(null);
      if (ending.type === 'pointerup' && end !== event.sourceEnd) resizeTo(event, end);
    };
    document.addEventListener('pointermove', movePointer);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };
  return (
    <section className="hourly-schedule" aria-label="小时计划">
      <div className="hourly-toolbar">
        <span>
          <Clock size={14} />
          双击空白处新建；拖动安排时间
        </span>
        <AppSelect
          aria-label="时间表时区"
          value={grid.timeZone}
          disabled={page.locked}
          onChange={(event) => updateView({ timeZone: event.target.value })}
        >
          {[...new Set([grid.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </AppSelect>
      </div>
      <div className="hourly-scroll" ref={scroll}>
        <div
          className="hourly-grid"
          style={{ gridTemplateColumns: `repeat(${grid.days.length}, minmax(112px, 1fr))` }}
        >
          {grid.days.map((day) => (
            <div className="hourly-day" key={day.date} data-hour-date={day.date}>
              <div className="hourly-day-header">
                <header>
                  <button
                    type="button"
                    onClick={() => updateView({ planMode: 'hourDay', dateAnchor: day.date })}
                  >
                    {day.date.slice(5)}
                    <small>
                      {['日', '一', '二', '三', '四', '五', '六'][new Date(day.date + 'T12:00').getDay()]}
                    </small>
                  </button>
                  <IconButton
                    label={`在 ${day.date} 添加小时计划`}
                    disabled={page.locked}
                    onClick={() => createAt(zonedDate(day.date + 'T09:00', grid.timeZone).epochMilliseconds)}
                  >
                    <Plus size={13} />
                  </IconButton>
                </header>
                <div
                  className="hourly-all-day"
                  data-all-day={day.date}
                  style={{ height: allDayHeight }}
                  onDragOver={(event) => {
                    if (
                      !grid.readonlyDates &&
                      !page.locked &&
                      event.dataTransfer.types.includes('application/x-mini-row')
                    )
                      event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropAt(null);
                    execute(event.dataTransfer.getData('application/x-mini-row'), {
                      date: day.date,
                      allDay: true,
                    });
                  }}
                >
                  <small>全天{day.minutes !== 1440 ? ` · ${day.minutes / 60} 小时日` : ''}</small>
                  {day.allDay.map((id) => {
                    const row = rowFor(id)!;
                    return (
                      <button
                        type="button"
                        className="hourly-all-day-event"
                        style={recordAppearanceStyle(row, theme)}
                        key={id}
                        data-record-id={id}
                        draggable={!grid.readonlyDates && !page.locked && !row.locked}
                        onDragStart={(event) => event.dataTransfer.setData('application/x-mini-row', id)}
                        onClick={() => openRow(id)}
                      >
                        <PageIcon icon={row.icon} size={12} />
                        {row.title || '无标题'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className="hourly-slots"
                data-time-slots={day.date}
                style={{ height }}
                onDragOver={(event) => {
                  if (
                    !grid.readonlyDates &&
                    !page.locked &&
                    event.dataTransfer.types.includes('application/x-mini-row')
                  ) {
                    event.preventDefault();
                    setDropAt({
                      date: day.date,
                      minute:
                        (gridInstant(
                          day,
                          (event.clientY - event.currentTarget.getBoundingClientRect().top) / pixelsPerMinute,
                        ) -
                          day.startTimestamp) /
                        60000,
                    });
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropAt(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const timestamp = gridInstant(
                    day,
                    (event.clientY - event.currentTarget.getBoundingClientRect().top) / pixelsPerMinute,
                  );
                  const offset = Number(event.dataTransfer.getData('application/x-mini-time-offset')) || 0;
                  move(event.dataTransfer.getData('application/x-mini-row'), timestamp - offset);
                  setDropAt(null);
                }}
                onDoubleClick={(event) => {
                  if (!(event.target as HTMLElement).closest('.hourly-event'))
                    createAt(
                      gridInstant(
                        day,
                        (event.clientY - event.currentTarget.getBoundingClientRect().top) / pixelsPerMinute,
                      ),
                    );
                }}
              >
                {day.hours.map((hour) => (
                  <div
                    className="hourly-tick"
                    key={hour.minute}
                    style={{ top: hour.minute * pixelsPerMinute }}
                    title={`${day.date} ${hour.label} UTC${hour.offset}`}
                  >
                    <span>
                      {hour.label}
                      {day.minutes !== 1440 && <small className="hourly-offset">{hour.offset}</small>}
                    </span>
                  </div>
                ))}
                {day.minutes * pixelsPerMinute < height && (
                  <div
                    className="hourly-outside-day"
                    style={{ top: day.minutes * pixelsPerMinute, bottom: 0 }}
                  >
                    —
                  </div>
                )}
                {day.events.map((event) => {
                  const row = rowFor(event.id)!;
                  const endMinute =
                    resize?.id === event.id
                      ? Math.min(day.minutes, (resize.end - day.startTimestamp) / 60000)
                      : event.minuteEnd;
                  const top = event.minuteStart * pixelsPerMinute,
                    eventHeight = Math.max(10, (endMinute - event.minuteStart) * pixelsPerMinute - 2);
                  const endTimestamp = resize?.id === event.id ? resize.end : event.sourceEnd;
                  const startLabel = event.continuesBefore ? '00:00' : event.start.slice(11, 16);
                  const endLabel =
                    endTimestamp >= day.endTimestamp
                      ? '24:00'
                      : timeInZone(endTimestamp, grid.timeZone).slice(11, 16);
                  const label = startLabel + (event.hasEnd || resize?.id === event.id ? `–${endLabel}` : '');
                  return (
                    <div
                      className={`hourly-event ${isDone(row) ? 'completed' : ''} ${eventHeight < 35 ? 'compact' : ''}`}
                      role="button"
                      tabIndex={0}
                      key={event.id}
                      data-record-id={event.id}
                      data-time-event={event.id}
                      aria-label={`${row.title || '无标题'} ${label}`}
                      title={`${row.title || '无标题'}\n${event.start} → ${event.hasEnd ? event.end : '未设置结束时间'}\n⌥↑↓ 移动 15 分钟 · ⌥←→ 移动一天 · ⌥⇧↑↓ 调整时长`}
                      style={{
                        ...recordAppearanceStyle(row, theme),
                        top,
                        height: eventHeight,
                        left: `calc(${(event.column / event.columns) * 100}% + ${28 * (1 - event.column / event.columns)}px)`,
                        width: `calc(${100 / event.columns}% - ${28 / event.columns + 3}px)`,
                      }}
                      draggable={!grid.readonlyDates && !page.locked && !row.locked && !resize}
                      onDragStart={(drag) => {
                        drag.dataTransfer.setData('application/x-mini-row', row.id);
                        const grabbed = Math.max(
                          0,
                          Math.round(
                            (drag.clientY - drag.currentTarget.getBoundingClientRect().top) /
                              pixelsPerMinute /
                              15,
                          ) * 15,
                        );
                        drag.dataTransfer.setData(
                          'application/x-mini-time-offset',
                          String(
                            day.startTimestamp + (event.minuteStart + grabbed) * 60000 - event.sourceStart,
                          ),
                        );
                      }}
                      onDragEnd={() => setDropAt(null)}
                      onClick={() => openRow(row.id)}
                      onKeyDown={(key) => {
                        if (key.target !== key.currentTarget) return;
                        if (key.key === 'Enter') openRow(row.id);
                        if (
                          key.altKey &&
                          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key.key)
                        ) {
                          key.preventDefault();
                          const direction = ['ArrowUp', 'ArrowLeft'].includes(key.key) ? -1 : 1;
                          if (key.shiftKey && ['ArrowUp', 'ArrowDown'].includes(key.key))
                            resizeTo(event, event.sourceEnd + direction * 15 * 60000);
                          else
                            move(
                              event.id,
                              ['ArrowLeft', 'ArrowRight'].includes(key.key)
                                ? zonedDate(event.start, grid.timeZone).add({ days: direction })
                                    .epochMilliseconds
                                : event.sourceStart + direction * 15 * 60000,
                            );
                        }
                      }}
                    >
                      <div className="hourly-event-label" style={{ top: allDayHeight + 40 }}>
                        <div className="hourly-event-title">
                          {complete && (
                            <input
                              type="checkbox"
                              aria-label={`完成 ${row.title || '无标题'}`}
                              checked={isDone(row)}
                              disabled={page.locked || row.locked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => complete(row, event.target.checked)}
                            />
                          )}
                          <strong>
                            {event.continuesBefore ? '↑ ' : ''}
                            {row.title || '无标题'}
                            {event.continuesAfter ? ' ↓' : ''}
                          </strong>
                        </div>
                        <span className="hourly-event-time">{label}</span>
                      </div>
                      {!event.continuesAfter && !grid.readonlyDates && !page.locked && !row.locked && (
                        <div
                          className="hourly-resize"
                          aria-label={`调整 ${row.title || '无标题'} 的结束时间`}
                          onPointerDown={(pointer) => startResize(pointer, event, day.startTimestamp)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })}
                {grid.now >= day.startTimestamp && grid.now < day.endTimestamp && (
                  <div
                    className="hourly-now"
                    style={{ top: ((grid.now - day.startTimestamp) / 60000) * pixelsPerMinute }}
                  />
                )}
                {dropAt?.date === day.date && (
                  <div className="hourly-drop-time" style={{ top: dropAt.minute * pixelsPerMinute }}>
                    {timeInZone(day.startTimestamp + dropAt.minute * 60000, grid.timeZone).slice(11, 16)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <table className="hourly-print-agenda">
        <caption>详细日程 · {grid.timeZone}</caption>
        {grid.days.map((day) => (
          <tbody key={day.date}>
            <tr>
              <th colSpan={2}>{day.date}</th>
            </tr>
            {day.allDay.map((id) => (
              <tr key={id}>
                <td>全天</td>
                <td>
                  {isDone(rowFor(id)!) ? '✓ ' : ''}
                  {rowFor(id)!.title || '无标题'}
                </td>
              </tr>
            ))}
            {day.events.map((event) => (
              <tr key={event.id}>
                <td>
                  {event.start.replace('T', ' ')}
                  <br />
                  {event.hasEnd ? `→ ${event.end.replace('T', ' ')}` : '未设置结束时间'}
                </td>
                <td>
                  {isDone(rowFor(event.id)!) ? '✓ ' : ''}
                  {rowFor(event.id)!.title || '无标题'}
                </td>
              </tr>
            ))}
            {!day.allDay.length && !day.events.length && (
              <tr>
                <td colSpan={2}>暂无安排</td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </section>
  );
}
