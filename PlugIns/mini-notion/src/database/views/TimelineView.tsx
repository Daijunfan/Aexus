import { EventSummary } from '../../components/EventSummary';
import { eventDescription, eventPresenter } from '../../scheduling/presentation';
import {AppSelect} from '../../components/AppSelect';
import { AppearanceTheme, recordAppearanceStyle } from '../../appearance';
import { isDateProperty } from '../propertySchema';
import { useContext, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange, SlidersHorizontal } from 'lucide-react';
import { useWorkspace } from '../../store';
import { IconButton } from '../../ui';
import { groupRows, type RowGroup } from '../model';
import type { ViewProps } from './types';
import {
  dateKey as key,
  parseDay,
  viewPeriod,
  navigateViewDate,
  timelineScales,
  scheduleFields,
  scheduledRange,
  moveScheduledRecord,
  resizeScheduledRecord,
} from '../dates';
import { hierarchyRows, type HierarchyRow } from '../structure';
import { RecordTitle } from '../RecordTitle';
import { TimelineDependencies, DependencyHandle } from '../TimelineDependencies';

const dayMs = 86400000;
export function TimelineView({ page, view, rows, updateView, openRow, addRow }: ViewProps) {
  const theme = useContext(AppearanceTheme);
  const { patch, workspace } = useWorkspace();
  const grouped = groupRows(rows, view.groupBy, page.database!, workspace!.pages, view);
  const entries: (HierarchyRow | RowGroup)[] = view.groupBy
    ? grouped.flatMap((group) => [
        group,
        ...(view.collapsedGroups?.includes(group.key)
          ? []
          : hierarchyRows(group.rows, view, !!page.database!.subItems)),
      ])
    : hierarchyRows(rows, view, !!page.database!.subItems);
  const grid = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<{ from: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; start: string; end: string } | null>(null);
  const describe = eventPresenter(workspace!, page, view);
  const dates = page.database!.columns.filter(isDateProperty);
  const { start: startColumn, end: endColumn } = scheduleFields(page, view);
  const readonlyDates = startColumn?.type !== 'date' || (!!endColumn && endColumn.type !== 'date');
  const scale = view.timelineScale || 'month';
  const config = timelineScales[scale];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const origin = viewPeriod(view).first;
  const days = Array.from(
    { length: config.days },
    (_, i) => new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + i, 12),
  );
  const width = config.days * config.width;
  if (!startColumn)
    return (
      <div className="empty-state">
        <CalendarRange size={32} />
        <h3>添加日期以使用时间线</h3>
        <button
          className="primary-button"
          disabled={page.locked}
          onClick={() =>
            patch(page.id, {
              database: {
                ...page.database!,
                columns: [
                  ...page.database!.columns,
                  { id: crypto.randomUUID(), name: '开始日期', type: 'date' },
                  { id: crypto.randomUUID(), name: '结束日期', type: 'date' },
                ],
              },
            })
          }
        >
          添加开始和结束日期
        </button>
      </div>
    );
  const dragBar = (event: React.PointerEvent, id: string, from: Date, to: Date, resize: boolean) => {
    if (event.button !== 0 || readonlyDates || page.locked || rows.find((row) => row.id === id)?.locked)
      return;
    event.preventDefault();
    event.stopPropagation();
    const x = event.clientX;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    let delta = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId || !(e.buttons & 1)) return;
      delta = Math.round((e.clientX - x) / config.width);
      const start = new Date(from);
      const end = new Date(to);
      if (!resize) start.setDate(start.getDate() + delta);
      end.setDate(end.getDate() + delta);
      if (end < start) end.setTime(start.getTime());
      setDrag({ id, start: key(start), end: key(end) });
    };
    const finish = (ending: PointerEvent) => {
      if (ending.pointerId !== event.pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      setDrag(null);
      if (ending.type === 'pointercancel') return;
      if (!delta) {
        if (!resize) openRow(id);
        return;
      }
      const row = rows.find((row) => row.id === id)!;
      const start = new Date(from);
      const end = new Date(to);
      if (!resize) start.setDate(start.getDate() + delta);
      end.setDate(end.getDate() + delta);
      if (end < start) end.setTime(start.getTime());
      patch(id, {
        values: resize
          ? resizeScheduledRecord(row, startColumn.id, endColumn?.id, key(end))
          : moveScheduledRecord(row, startColumn.id, endColumn?.id, key(start)),
      });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };
  return (
    <div className="timeline-view">
      <div className="timeline-controls">
        <strong>
          {origin.getFullYear()} 年 {origin.getMonth() + 1} 月
        </strong>
        <details className="schedule-fields">
          <summary><SlidersHorizontal size={14} /> 日期属性</summary>
          <div>
        <label>
          开始
          <AppSelect
            aria-label="时间线开始属性"
            value={startColumn.id}
            onChange={(e) => updateView({ calendarBy: e.target.value })}
          >
            {dates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AppSelect>
        </label>
        <label>
          结束
          <AppSelect
            aria-label="时间线结束属性"
            value={endColumn?.id || ''}
            onChange={(e) => updateView({ timelineEnd: e.target.value })}
          >
            <option value="">同一日期范围</option>
            {dates
              .filter((c) => c.id !== startColumn.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </AppSelect>
        </label>
          </div>
        </details>
        <AppSelect
          aria-label="时间线缩放"
          value={scale}
          onChange={(e) => updateView({ timelineScale: e.target.value as typeof scale })}
        >
          <option value="week">周</option>
          <option value="month">月</option>
          <option value="quarter">季度</option>
          <option value="year">年</option>
        </AppSelect>
        <button className="text-button" onClick={() => updateView(navigateViewDate(view, 'today'))}>
          今天
        </button>
        <IconButton label="上一时间段" onClick={() => updateView(navigateViewDate(view, 'previous'))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="下一时间段" onClick={() => updateView(navigateViewDate(view, 'next'))}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-grid" ref={grid} style={{ width: width + 280 }}>
          <div className="timeline-heading">
            <div className="timeline-name-header">名称</div>
            <div className="timeline-axis" style={{ width }}>
              {days.map((date, i) => (
                <span
                  key={i}
                  style={{ left: i * config.width, width: config.width }}
                  className={date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : ''}
                >
                  {scale === 'week' || scale === 'month'
                    ? date.getDate() === 1
                      ? `${date.getMonth() + 1}月`
                      : date.getDate()
                    : date.getDate() === 1
                      ? `${date.getMonth() + 1}月`
                      : ''}
                </span>
              ))}
            </div>
          </div>
          {entries.map((item) => {
            if ('rows' in item)
              return (
                <div key={`group-${item.key}`} className="timeline-group-row">
                  <button
                    onClick={() =>
                      updateView({
                        collapsedGroups: view.collapsedGroups?.includes(item.key)
                          ? view.collapsedGroups.filter((key) => key !== item.key)
                          : [...(view.collapsedGroups || []), item.key],
                      })
                    }
                  >
                    <ChevronRight
                      size={13}
                      className={view.collapsedGroups?.includes(item.key) ? '' : 'rotated'}
                    />
                    {item.label}
                    <small>{item.rows.length}</small>
                  </button>
                </div>
              );
            const row = item.page;
            const range = scheduledRange(row, startColumn, endColumn);
            const start = parseDay(drag?.id === row.id ? drag.start : range.start);
            const end = parseDay(drag?.id === row.id ? drag.end : range.end) || start;
            const left = start ? Math.round((start.getTime() - origin.getTime()) / dayMs) * config.width : 0;
            const duration =
              start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1) : 1;
            const info = describe(row), visibleLeft = Math.max(0, left);
            const visibleWidth = Math.max(0, Math.min(width, left + duration * config.width - 4) - visibleLeft);
            return (
              <div className="timeline-row" key={row.id}>
                <div className="timeline-row-name" title={eventDescription(info)}>
                  <div className="timeline-row-info">
                  <RecordTitle
                    entry={item}
                    database={page}
                    view={view}
                    onViewChange={updateView}
                    onOpen={openRow}
                  />
                    <small>{info.when} · {info.status}</small>
                  </div>
                </div>
                <div
                  className="timeline-lane"
                  style={{ width, backgroundSize: `${config.width}px 100%` }}
                  onDoubleClick={(e) => {
                    if (start || readonlyDates || page.locked) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const date = days[Math.floor((e.clientX - rect.left) / config.width)];
                    if (date) patch(row.id, { values: { ...row.values, [startColumn.id]: key(date) } });
                  }}
                >
                  {start && end && visibleWidth > 0 && (
                    <div
                      className={`timeline-bar ${visibleWidth < 180 ? 'short-bar' : ''} ${drag?.id === row.id ? 'dragging' : ''}`}
                      data-timeline-id={row.id}
                      data-label-side={width - visibleLeft - visibleWidth < 230 && visibleLeft > 230 ? 'before' : 'after'}
                      role="button"
                      tabIndex={0}
                      aria-label={`${row.title} ${key(start)} 至 ${key(end)}`}
                      style={{ ...recordAppearanceStyle(row, theme, workspace!.settings.appearance), left: visibleLeft, width: Math.max(8, visibleWidth) }}
                      onPointerDown={(e) => dragBar(e, row.id, start, end, false)}
                      onClick={() => { if (readonlyDates || page.locked || row.locked) openRow(row.id); }}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRow(row.id); }
                      }}
                      title={eventDescription(info)}
                    >
                      <EventSummary info={info} />
                      {page.database!.dependencies?.enabled && !page.locked && (
                        <DependencyHandle row={row} rows={rows} onConnection={setConnection} />
                      )}
                      {!readonlyDates && !page.locked && !row.locked && (
                        <div
                          className="timeline-resize"
                          onPointerDown={(e) => dragBar(e, row.id, start, end, true)}
                        />
                      )}
                    </div>
                  )}
                  <span
                    className="timeline-today"
                    style={{ left: Math.round((today.getTime() - origin.getTime()) / dayMs) * config.width }}
                  />
                </div>
              </div>
            );
          })}
          {page.database!.dependencies?.enabled && (
            <TimelineDependencies
              container={grid}
              rows={rows}
              readOnly={page.locked}
              refresh={drag}
              connection={connection}
            />
          )}
          <button className="database-add-row" onClick={() => addRow()} disabled={page.locked}>
            ＋ 新建页面
          </button>
        </div>
      </div>
      <p className="timeline-footnote">
        拖动条目调整日期，拖动右边缘调整持续时间。无日期记录可双击对应日期来安排。
      </p>
    </div>
  );
}
