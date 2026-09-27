import {AppSelect} from './AppSelect';
import { isDateProperty, propertyDateValue } from '../database/propertySchema';
import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AppearanceTheme, recordAppearanceStyle } from '../appearance';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { readProperty } from '../model';
import { visibleColumns, subItemDisplay } from '../database/model';
import {
  dateKey,
  navigateViewDate,
  viewPeriod,
  calendarWeeks,
  calendarVisibleSlots,
  scheduleFields,
  scheduledRange,
  moveScheduledRecord,
  parseDay,
} from '../database/dates';
import { dateWall, dateText } from '../database/dateValue';
import { defaultTemplateId } from '../database/templatesModel';
import { SubitemPreview } from '../database/RecordTitle';
import { useWorkspace } from '../store';
import { IconButton, PageIcon, Popover } from '../ui';
import type { Page, DatabaseView } from '../types';

export { dateKey } from '../database/dates';
export function CalendarView({
  page,
  rows,
  view,
  onViewChange,
  openRow,
}: {
  page: Page;
  rows: Page[];
  view?: DatabaseView;
  onViewChange?: (changes: Partial<DatabaseView>) => void;
  openRow?: (id: string) => void;
}) {
  const { patch, create, setPeekId, workspace } = useWorkspace();
  const theme = useContext(AppearanceTheme);
  const [localView, setLocalView] = useState<DatabaseView>({
    id: 'calendar',
    name: '日历',
    type: 'calendar',
  });
  const [dropDate, setDropDate] = useState('');
  const [dayPanel, setDayPanel] = useState<{ date: string; x: number; y: number } | null>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const currentView = view || localView;
  const changeView = (changes: Partial<DatabaseView>) =>
    onViewChange ? onViewChange(changes) : setLocalView({ ...currentView, ...changes });
  const month = viewPeriod(currentView).anchor;
  const week = currentView.calendarMode === 'week';
  const open = openRow || setPeekId;
  const db = page.database!;
  const dates = db.columns.filter(isDateProperty);
  const { start: dateProperty, end: endProperty } = scheduleFields(page, currentView);
  const displayed = visibleColumns(db, currentView).filter(
    (column) =>
      column.id !== dateProperty?.id &&
      column.id !== endProperty?.id &&
      !(column.system === 'subItems' && db.subItems && subItemDisplay(currentView) === 'card'),
  );
  const weeks = calendarWeeks(page, currentView, rows);
  const ranges = new Map(rows.map((row) => [row.id, scheduledRange(row, dateProperty, endProperty)]));
  const readonlyDates = dateProperty?.type !== 'date' || (!!endProperty && endProperty.type !== 'date');
  const today = dateKey(new Date());
  useEffect(() => {
    const showDay = (event: Event) => {
      const { pageId, viewId, date, visible } = (event as CustomEvent).detail;
      if (visible === false && (!pageId || pageId === page.id)) { setDayPanel(null); return; }
      if (pageId !== page.id || (viewId && viewId !== currentView.id)) return;
      const cell = calendar.current?.querySelector<HTMLElement>(`[data-date="${CSS.escape(date)}"]`);
      const rect = (cell || calendar.current)?.getBoundingClientRect();
      if (rect) setDayPanel({ date, x: rect.left, y: cell ? rect.top + 28 : rect.top });
    };
    window.addEventListener('mini:calendar-day', showDay);
    return () => window.removeEventListener('mini:calendar-day', showDay);
  }, [page.id, currentView.id]);
  const add = (date = '') => {
    if (readonlyDates) return;
    const row = create(
      { parentId: page.id, values: dateProperty ? { [dateProperty.id]: date } : {} },
      false,
      defaultTemplateId(db, currentView),
    );
    open(row.id);
  };
  const drag = (event: React.DragEvent, row: Page, date = '') => {
    event.dataTransfer.setData('application/x-mini-row', row.id);
    event.dataTransfer.setData('application/x-mini-date', date);
  };
  const drop = (event: React.DragEvent, date: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDropDate('');
    const row = rows.find((row) => row.id === event.dataTransfer.getData('application/x-mini-row'));
    if (row && dateProperty && !readonlyDates && !page.locked && !row.locked)
      patch(row.id, {
        values: moveScheduledRecord(
          row,
          dateProperty.id,
          endProperty?.id,
          date,
          event.dataTransfer.getData('application/x-mini-date'),
        ),
      });
  };
  if (!dateProperty)
    return (
      <div className="empty-state">
        <CalendarDays size={30} />
        <h3>为数据库添加一个日期属性</h3>
        <p>日历会按照日期属性来展示记录。</p>
        <button
          className="primary-button"
          disabled={page.locked}
          onClick={() =>
            patch(page.id, {
              database: {
                ...db,
                columns: [...db.columns, { id: crypto.randomUUID(), name: '日期', type: 'date' }],
              },
            })
          }
        >
          添加日期属性
        </button>
      </div>
    );
  const properties = (row: Page, labels = true) =>
    displayed.flatMap((column) => {
      const value = readProperty(row, column, workspace!.pages);
      const text = isDateProperty(column)
        ? dateText(value)
        : Array.isArray(value)
          ? value.join('、')
          : value === false
            ? ''
            : value === true
              ? '是'
              : String(value);
      return text ? [labels ? `${column.name}：${text}` : text] : [];
    });
  const fullDate = (row: Page) =>
    dateText(propertyDateValue(row, dateProperty)) +
    (endProperty && propertyDateValue(row, endProperty)
      ? ` → ${dateText(propertyDateValue(row, endProperty))}`
      : '');
  const eventContent = (row: Page, continuedBefore = false, continuedAfter = false) => {
    const time = dateWall(propertyDateValue(row, dateProperty)).slice(11, 16);
    return (
      <>
        <span className="calendar-event-main">
          {continuedBefore ? <ChevronLeft size={12} /> : <PageIcon icon={row.icon} size={13} />}
          {time && !continuedBefore && <span className="calendar-event-time">{time}</span>}
          <span className="calendar-event-title">{row.title || '无标题'}</span>
          {continuedAfter && <ChevronRight size={12} />}
        </span>
        <span className="calendar-event-meta">{properties(row, false).join(' · ')}</span>
      </>
    );
  };
  const dayRows = dayPanel
    ? rows.filter((row) => {
        const range = ranges.get(row.id)!;
        return range.start && range.start <= dayPanel.date && range.end >= dayPanel.date;
      })
    : [];
  const unplanned = rows.filter((row) => !ranges.get(row.id)?.start);
  return (
    <div className="calendar-view" ref={calendar}>
      <div className="calendar-controls">
        <strong>
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </strong>
        <AppSelect
          aria-label="日历日期属性"
          value={dateProperty.id}
          onChange={(event) => changeView({ calendarBy: event.target.value })}
        >
          {dates.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </AppSelect>
        {dates.length > 1 && (
          <AppSelect
            aria-label="日历结束日期"
            title="结束日期属性"
            value={endProperty?.id || ''}
            onChange={(event) => changeView({ timelineEnd: event.target.value })}
          >
            <option value="">开始属性中的结束日期</option>
            {dates
              .filter((column) => column.id !== dateProperty.id)
              .map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
          </AppSelect>
        )}
        <button className="text-button" onClick={() => changeView(navigateViewDate(currentView, 'today'))}>
          今天
        </button>
        <IconButton
          label={week ? '上一周' : '上个月'}
          onClick={() => changeView(navigateViewDate(currentView, 'previous'))}
        >
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton
          label={week ? '下一周' : '下个月'}
          onClick={() => changeView(navigateViewDate(currentView, 'next'))}
        >
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className="calendar-weekdays">
        {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        className={`calendar-grid ranged-calendar ${week ? 'calendar-week' : ''}`}
        style={
          {
            '--calendar-visible-slots': calendarVisibleSlots,
            '--calendar-print-slots': Math.max(calendarVisibleSlots, ...weeks.map((item) => item.totalSlotCount)),
          } as CSSProperties
        }
      >
        {weeks.map((item) => (
          <div
            className="calendar-week-row"
            key={item.dates[0]}
            onDragOver={(event) => {
              if (
                !readonlyDates &&
                !page.locked &&
                event.dataTransfer.types.includes('application/x-mini-row')
              ) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setDropDate(
                  item.dates[
                    Math.min(6, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 7)))
                  ],
                );
              }
            }}
            onDragLeave={() => setDropDate('')}
            onDrop={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              drop(
                event,
                item.dates[
                  Math.min(6, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 7)))
                ],
              );
            }}
          >
            {item.dates.map((key) => {
              const day = parseDay(key)!;
              return (
                <div
                  className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${dropDate === key ? 'drag-over' : ''}`}
                  data-date={key}
                  key={key}
                  onDrop={(event) => drop(event, key)}
                >
                  <div className="calendar-day-top">
                    <span className={key === today ? 'today' : ''}>
                      {day.getDate() === 1 ? `${day.getMonth() + 1}月1日` : day.getDate()}
                    </span>
                    <IconButton
                      label={`在 ${key} 新建`}
                      disabled={page.locked || readonlyDates}
                      onClick={() => add(key)}
                    >
                      <Plus size={12} />
                    </IconButton>
                  </div>
                  {item.hiddenByDate[key].length > 0 && (
                    <button
                      className="calendar-more"
                      aria-label={`查看 ${key} 的全部日程，另有 ${item.hiddenByDate[key].length} 项`}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setDayPanel({ date: key, x: rect.left, y: rect.bottom + 4 });
                      }}
                    >
                      还有 {item.hiddenByDate[key].length} 项
                    </button>
                  )}
                </div>
              );
            })}
            <div className="calendar-events">
              {item.events.map((segment) => {
                const row = rows.find((row) => row.id === segment.id)!;
                const range = ranges.get(row.id)!;
                return (
                  <button
                    key={row.id}
                    className={`calendar-event ${segment.slot >= calendarVisibleSlots ? 'overflow-event' : ''} ${segment.continuedBefore ? 'continues-before' : ''} ${segment.continuedAfter ? 'continues-after' : ''}`}
                    data-calendar-id={row.id}
                    aria-label={`${row.title || '无标题'} ${range.start} 至 ${range.end}`}
                    style={{
                      ...recordAppearanceStyle(row, theme),
                      gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
                      gridRow: segment.slot + 1,
                    }}
                    draggable={!readonlyDates && !page.locked && !row.locked}
                    onDragStart={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offset = Math.min(
                        segment.span - 1,
                        Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * segment.span)),
                      );
                      drag(event, row, item.dates[segment.startColumn + offset]);
                    }}
                    onClick={() => open(row.id)}
                    title={[row.title || '无标题', fullDate(row), ...properties(row)].join('\n')}
                  >
                    {eventContent(row, segment.continuedBefore, segment.continuedAfter)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {dayPanel && (
        <Popover x={dayPanel.x} y={dayPanel.y} width={340} role="dialog" label={`${dayPanel.date} 的全部日程`} onClose={() => setDayPanel(null)}>
          <div className="calendar-day-panel">
            <header>
              <strong>{dayPanel.date}</strong>
              <span>{dayRows.length} 项日程</span>
              <IconButton label="关闭当天日程" onClick={() => setDayPanel(null)}>
                <X size={15} />
              </IconButton>
            </header>
            <div className="calendar-day-list">
              {dayRows.map((row) => (
                <div className="calendar-day-item" key={row.id} style={recordAppearanceStyle(row, theme)}>
                  <button
                    title={[row.title || '无标题', fullDate(row), ...properties(row)].join('\n')}
                    onClick={() => {
                      setDayPanel(null);
                      open(row.id);
                    }}
                  >
                    <span className="calendar-day-item-title">
                      <PageIcon icon={row.icon} size={14} />
                      <span>{row.title || '无标题'}</span>
                    </span>
                    <small>{fullDate(row)}</small>
                    {properties(row).length > 0 && <small>{properties(row).join(' · ')}</small>}
                  </button>
                  {db.subItems && subItemDisplay(currentView) === 'card' && (
                    <SubitemPreview row={row} onOpen={(id) => { setDayPanel(null); open(id); }} />
                  )}
                </div>
              ))}
              {!dayRows.length && <p className="calendar-day-empty">当天没有日程</p>}
            </div>
            <button
              className="calendar-day-add"
              disabled={page.locked || readonlyDates}
              onClick={() => {
                setDayPanel(null);
                add(dayPanel.date);
              }}
            >
              <Plus size={14} />
              新建日程
            </button>
          </div>
        </Popover>
      )}
      {!!unplanned.length && (
        <details className="calendar-unplanned">
          <summary>无日期 · {unplanned.length} 个页面</summary>
          {unplanned.map((row) => (
            <button
              key={row.id}
              draggable={!readonlyDates && !page.locked && !row.locked}
              onDragStart={(event) => drag(event, row)}
              onClick={() => open(row.id)}
            >
              <PageIcon icon={row.icon} size={14} />
              {row.title || '无标题'}
            </button>
          ))}
        </details>
      )}
    </div>
  );
}
