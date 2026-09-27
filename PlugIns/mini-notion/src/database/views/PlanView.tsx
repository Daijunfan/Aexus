import {AppSelect} from '../../components/AppSelect';
import { useContext, useEffect, useState } from 'react';
import { AppearanceTheme, recordAppearanceStyle } from '../../appearance';
import { TimeGrid } from './TimeGrid';
import { DateInput } from '../DateInput';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react';
import { useWorkspace } from '../../store';
import { IconButton, PageIcon } from '../../ui';
import { readProperty } from '../../model';
import { visibleColumns } from '../model';
import {
  dateKey,
  navigateViewDate,
  parseDay,
  planProjection,
  moveScheduledRecord,
  isHourlyPlan,
  isDayPlan,
  planModes,
} from '../dates';
import { defaultTemplateId } from '../templatesModel';
import { subItemDisplay } from '../model';
import { SubitemPreview } from '../RecordTitle';
import type { Page, DatabaseView } from '../../types';
import type { ViewProps } from './types';

export function PlanView({ page, view, rows, updateView, openRow, addRow }: ViewProps) {
  const theme = useContext(AppearanceTheme);
  const { workspace, patch, create } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const plan = planProjection(page, view, rows, now);
  const dates = page.database!.columns.filter(isDateProperty);
  const mode = view.planMode || 'week';
  const hasBacklog = view.planShowBacklog ?? (plan.unscheduled.length > 0 || plan.overdue.length > 0);
  const days = mode === 'agenda' ? plan.days.filter((day) => day.records.length) : plan.days;
  const today = dateKey(now);
  const displayed = visibleColumns(page.database!, view).filter(
    (column) => ![plan.dateProperty?.id, plan.endProperty?.id, plan.doneProperty?.id].includes(column.id),
  );
  const record = (id: string) => rows.find((row) => row.id === id)!;
  const readonlyDates =
    plan.dateProperty?.type !== 'date' || (!!plan.endProperty && plan.endProperty.type !== 'date');
  const setDate = (id: string, date: string, grabbedDate?: string) => {
    const row = record(id);
    if (!row || readonlyDates || row.locked || page.locked || !plan.dateProperty) return;
    patch(id, {
      values: moveScheduledRecord(row, plan.dateProperty.id, plan.endProperty?.id, date, grabbedDate),
    });
  };
  const add = (date: string) => {
    if (readonlyDates) return;
    const row = create(
      { parentId: page.id, values: plan.dateProperty ? { [plan.dateProperty.id]: date } : {} },
      false,
      defaultTemplateId(page.database!, view),
    );
    openRow(row.id);
  };
  const complete = (row: Page, done: boolean) => {
    if (!plan.doneProperty || page.locked || row.locked) return;
    patch(row.id, {
      values: {
        ...row.values,
        [plan.doneProperty.id]:
          plan.doneProperty.type === 'checkbox'
            ? done
            : done
              ? plan.doneValue
              : plan.doneProperty.type === 'status'
                ? defaultStatus(plan.doneProperty)
                : plan.doneProperty.options?.find((value) => value !== plan.doneValue) || '',
      },
    });
  };
  const card = (row: Page, date = '') => (
    <div
      className={`plan-card ${plan.isDone(row) ? 'completed' : ''}`}
      style={recordAppearanceStyle(row, theme)}
      key={row.id}
      data-record-id={row.id}
      draggable={!readonlyDates && !page.locked && !row.locked}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-mini-row', row.id);
        event.dataTransfer.setData('application/x-mini-date', date);
      }}
    >
      <div className="plan-card-title">
        {plan.doneProperty && (
          <input
            type="checkbox"
            aria-label={`完成 ${row.title || '无标题'}`}
            checked={plan.isDone(row)}
            disabled={page.locked || row.locked}
            onChange={(event) => complete(row, event.target.checked)}
          />
        )}
        <button onClick={() => openRow(row.id)}>
          <PageIcon icon={row.icon} size={14} />
          <span>{row.title || '无标题'}</span>
        </button>
      </div>
      {displayed.length > 0 && (
        <div className="plan-card-properties">
          {displayed.map((column) => {
            const value = readProperty(row, column, workspace!.pages);
            return value === '' || value === false || (Array.isArray(value) && !value.length) ? null : (
              <span key={column.id} title={column.name}>
                {Array.isArray(value) ? value.join('、') : String(value)}
              </span>
            );
          })}
        </div>
      )}
      {page.database!.subItems && subItemDisplay(view) === 'card' && (
        <SubitemPreview row={row} onOpen={openRow} />
      )}
      {plan.dateProperty && (
        <DateInput
          compact
          pageId={row.id}
          propertyId={plan.dateProperty.id}
          label={`${row.title || '无标题'} 的计划日期`}
          value={propertyDateValue(row, plan.dateProperty)}
          disabled={readonlyDates || page.locked || row.locked}
          onChange={(value) => patch(row.id, { values: { ...row.values, [plan.dateProperty!.id]: value } })}
        />
      )}
    </div>
  );
  const lane = (date: string, title: string, ids: string[], extra = '') => (
    <section
      className={`plan-lane ${date === today ? 'today' : ''} ${extra}`}
      key={date || extra}
      data-date={date}
      onDragOver={(event) => {
        if (!readonlyDates && !page.locked && event.dataTransfer.types.includes('application/x-mini-row')) {
          event.preventDefault();
          event.currentTarget.classList.add('drag-over');
        }
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove('drag-over')}
      onDrop={(event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        setDate(
          event.dataTransfer.getData('application/x-mini-row'),
          date,
          event.dataTransfer.getData('application/x-mini-date'),
        );
      }}
    >
      <header>
        <span>{title}</span>
        <small>{ids.length}</small>
        <IconButton
          label={`在 ${date || '未排期'} 添加计划`}
          disabled={page.locked}
          onClick={() => add(date)}
        >
          <Plus size={14} />
        </IconButton>
      </header>
      <div className="plan-lane-cards">
        {ids.map((id) => card(record(id), date))}
      </div>
      <button className="plan-add" disabled={readonlyDates || page.locked} onClick={() => add(date)}>
        <Plus size={13} />
        新建计划
      </button>
    </section>
  );
  if (!plan.dateProperty)
    return (
      <div className="empty-state">
        <CalendarCheck size={32} />
        <h3>为计划添加日期属性</h3>
        <p>按日或按周安排任务，拖动卡片即可调整排期。</p>
        <button
          className="primary-button"
          disabled={page.locked}
          onClick={() =>
            patch(page.id, {
              database: {
                ...page.database!,
                columns: [
                  ...page.database!.columns,
                  { id: crypto.randomUUID(), name: '计划日期', type: 'date' },
                ],
              },
            })
          }
        >
          添加计划日期
        </button>
      </div>
    );
  return (
    <div className={`plan-view plan-${mode}`}>
      <div className="plan-controls">
        <strong>
          {plan.from}
          {!isDayPlan(view) && ` — ${plan.to}`}
        </strong>
        <details className="schedule-fields">
          <summary><SlidersHorizontal size={14} /> 日期属性</summary>
          <div>
        <AppSelect
          aria-label="计划日期属性"
          value={plan.dateProperty.id}
          onChange={(event) => updateView({ calendarBy: event.target.value })}
        >
          {dates.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </AppSelect>
        {dates.length > 1 && (
          <AppSelect
            aria-label="计划结束日期"
            value={plan.endProperty?.id || ''}
            onChange={(event) => updateView({ timelineEnd: event.target.value })}
          >
            <option value="">同一日期范围</option>
            {dates
              .filter((column) => column.id !== plan.dateProperty!.id)
              .map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
          </AppSelect>
        )}
          </div>
        </details>
        <AppSelect
          aria-label="计划布局"
          value={mode}
          onChange={(event) => updateView({ planMode: event.target.value as DatabaseView['planMode'] })}
        >
          {Object.entries(planModes).map(([mode, name]) => (
            <option key={mode} value={mode}>
              {name}
            </option>
          ))}
        </AppSelect>
        <label className="plan-hide-completed">
          <input
            type="checkbox"
            checked={!!view.planHideCompleted}
            onChange={(event) => updateView({ planHideCompleted: event.target.checked })}
          />
          隐藏已完成
        </label>
        <button className="text-button" onClick={() => updateView(navigateViewDate(view, 'today'))}>
          今天
        </button>
        <IconButton label="上一计划周期" onClick={() => updateView(navigateViewDate(view, 'previous'))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="下一计划周期" onClick={() => updateView(navigateViewDate(view, 'next'))}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className="plan-summary">
        <CalendarCheck size={14} />
        <span>
          {rows.length} 项计划 · 已完成 {plan.completed} 项
        </span>
        {plan.overdue.length > 0 && <span className="plan-overdue-count">{plan.overdue.length} 项逾期</span>}
        <button className="plan-backlog-toggle" aria-expanded={hasBacklog} onClick={() => updateView({ planShowBacklog: !hasBacklog })}>
          未排期 {plan.unscheduled.length}
        </button>
      </div>
      <div className="plan-body">
        {hasBacklog && <aside className="plan-backlog">
          {lane('', '未排期', plan.unscheduled, 'unscheduled')}
          {plan.overdue.length > 0 && (
            <section className="plan-overdue">
              <header>
                逾期 <small>{plan.overdue.length}</small>
              </header>
              {plan.overdue.map((id) => card(record(id)))}
            </section>
          )}
        </aside>}
        {isHourlyPlan(view) ? (
          <TimeGrid
            now={now}
            page={page}
            view={view}
            rows={plan.rows}
            openRow={openRow}
            addRow={addRow}
            updateView={updateView}
            isDone={plan.isDone}
            complete={plan.doneProperty ? complete : undefined}
          />
        ) : (
          <div className="plan-schedule">
            {!days.length && <div className="plan-agenda-empty">
              <CalendarCheck size={22} />
              <span>这一周期还没有计划</span>
              <button className="text-button" onClick={() => add(plan.from)} disabled={readonlyDates || page.locked}><Plus size={14} /> 添加计划</button>
            </div>}
            {days.map((day) => {
              const date = parseDay(day.date)!;
              const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
              return lane(day.date, `${weekday} ${date.getMonth() + 1}/${date.getDate()}`, day.records);
            })}
          </div>
        )}
      </div>
    </div>
  );
}
import { defaultStatus, isDateProperty, propertyDateValue } from '../propertySchema';
