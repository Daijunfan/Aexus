import { EventSummary } from './EventSummary';
import { eventPresenter, eventDescription, pageIndex, type EventInfo } from '../scheduling/presentation';
import { Popover } from '../ui';
import {AppSelect} from './AppSelect';
import { useContext, useState } from 'react';
import { AppearanceTheme, recordAppearanceStyle } from '../appearance';
import {
  CalendarDays,
  ListTodo,
  Columns3,
  Table2,
  ChartGantt,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { overviewProjection, type OverviewConfig, type OverviewItem } from '../core/overview';
import { dateKey, addDays, parseDay } from '../database/dates';

const views = [
  ['agenda', '议程', ListTodo],
  ['calendar', '日历', CalendarDays],
  ['board', '看板', Columns3],
  ['table', '表格', Table2],
  ['timeline', '时间线', ChartGantt],
] as const;
export function Overview() {
  const theme = useContext(AppearanceTheme);
  const { workspace, api, navigate, notify } = useWorkspace();
  const [dayPanel, setDayPanel] = useState<{ date: string; x: number; y: number } | null>(null);
  const describe = eventPresenter(workspace!);
  const byId = pageIndex(workspace!.pages);
  const describeItem = (item: OverviewItem): EventInfo => {
    const base = describe(byId.get(item.pageId)!);
    return { ...base, title: item.title, owner: item.spaceTitle,
      ...(item.kind === 'record' ? {} : {
        when: item.kind === 'reminder' ? `${item.time} · 提醒` : '未排期',
        fullWhen: item.dateLabel || `${item.start} ${item.time || ''}`.trim() || '未排期',
        status: item.status, tone: item.done ? 'done' as const : 'neutral' as const, reminders: 0,
      }),
    };
  };
  const projection = overviewProjection(workspace!);
  const { config, counts, items, groups, days, spaces } = projection;
  const configure = (changes: Partial<OverviewConfig>) =>
    void api('overview.configure', { changes }).catch((error) => notify(String(error)));
  const toggle = (item: OverviewItem) => {
    const method = item.blockId ? 'block.update' : 'record.update';
    const params = item.blockId
      ? { pageId: item.pageId, blockId: item.blockId, props: { checked: !item.done } }
      : {
          pageId: item.pageId,
          values: { [item.doneProperty!]: item.done ? item.openValue : item.doneValue },
        };
    void api(method, params).catch((error) => notify(String(error)));
  };
  const card = (item: OverviewItem, compact = false) => (
    <div key={item.id} data-overview-id={item.id} style={recordAppearanceStyle(item, theme, workspace!.settings.appearance)} className={`overview-item ${item.done ? 'done' : ''} ${compact ? 'compact' : ''}`}>
      {item.blockId || item.doneProperty ? (
        <input
          type="checkbox"
          aria-label={`完成 ${item.title}`}
          checked={item.done}
          onChange={() => toggle(item)}
        />
      ) : null}
      <button onClick={() => navigate(item.pageId, item.blockId)} title={eventDescription(describeItem(item))}>
        <EventSummary info={describeItem(item)} kind={item.kind} detailed={!compact} />
      </button>
      {!compact && <ArrowUpRight size={13} />}
    </div>
  );
  const anchor = parseDay(config.date) || new Date();
  const timelineDays = Array.from({ length: 14 }, (_, i) => dateKey(addDays(anchor, i)));
  return (
    <section className="overview" aria-label="综合日程">
      <div className="home-section-title overview-heading"><ListTodo size={16} /><span>我的任务</span></div>
      <div className="overview-counts">
        {(
          [
            ['today', '今天'],
            ['overdue', '逾期'],
            ['upcoming', '之后的计划'],
            ['unscheduled', '未排期'],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            className={config.scope === key ? 'selected' : ''}
            onClick={() => configure({ scope: config.scope === key ? 'all' : key })}
          >
            <span>{title}</span>
            <strong>{counts[key]}</strong>
          </button>
        ))}
      </div>
      <div className="overview-toolbar">
        <div className="overview-tabs">
          {views.map(([type, name, Icon]) => (
            <button
              key={type}
              className={config.view === type ? 'selected' : ''}
              onClick={() => configure({ view: type })}
            >
              <Icon size={14} />
              {name}
            </button>
          ))}
        </div>
        <AppSelect
          aria-label="综合页面空间筛选"
          value={config.spaceId}
          onChange={(e) => configure({ spaceId: e.target.value })}
        >
          <option value="">全部空间</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.title}
            </option>
          ))}
        </AppSelect>
        <input
          aria-label="搜索综合日程"
          placeholder="搜索事项…"
          value={config.query}
          onChange={(e) => configure({ query: e.target.value })}
        />
      </div>
      <div className="overview-date-toolbar">
        <button
          aria-label="上一周期"
          onClick={() =>
            configure({
              date: dateKey(
                config.view === 'calendar'
                  ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1, 12)
                  : addDays(anchor, -7),
              ),
            })
          }
        >
          <ChevronLeft size={15} />
        </button>
        <input
          type="date"
          aria-label="综合日程日期"
          value={config.date}
          onChange={(e) => e.target.value && configure({ date: e.target.value })}
        />
        <button
          aria-label="下一周期"
          onClick={() =>
            configure({
              date: dateKey(
                config.view === 'calendar'
                  ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1, 12)
                  : addDays(anchor, 7),
              ),
            })
          }
        >
          <ChevronRight size={15} />
        </button>
        <button onClick={() => configure({ date: dateKey(new Date()), scope: 'all' })}>今天</button>
        <label>
          <input
            type="checkbox"
            checked={config.hideCompleted}
            onChange={(e) => configure({ hideCompleted: e.target.checked })}
          />
          隐藏已完成
        </label>
        <span>{items.length} 项</span>
      </div>
      {config.view === 'calendar' ? (
        <div className="overview-calendar-scroll" tabIndex={0} aria-label="综合月历，可横向滚动"><div className="overview-calendar">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <div key={day} className="overview-weekday">
              {day}
            </div>
          ))}
          {days.map((day) => (
            <div
              key={day.date}
              className={`overview-day ${day.date === dateKey(new Date()) ? 'today' : ''} ${day.date.slice(0, 7) !== config.date.slice(0, 7) ? 'outside' : ''}`}
            >
              <span>{Number(day.date.slice(-2))}</span>
              {day.items.slice(0, 4).map(item => card(item, true))}
              {day.items.length > 4 && <button className="overview-more" onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect(); setDayPanel({ date: day.date, x: rect.left, y: rect.bottom });
              }}>还有 {day.items.length - 4} 项日程</button>}
            </div>
          ))}
        </div></div>
      ) : config.view === 'table' ? (
        <div className="overview-table">
          <table>
            <thead>
              <tr>
                <th>事项</th>
                <th>空间</th>
                <th>日期</th>
                <th>状态</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{card(item)}</td>
                  <td>{item.spaceTitle}</td>
                  <td>
                    {item.dateLabel || `${item.start || '未排期'} ${item.time || ''}`}
                  </td>
                  <td>{item.status}</td>
                  <td>{item.kind === 'record' ? '记录' : item.kind === 'todo' ? '待办' : '提醒'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : config.view === 'timeline' ? (
        <div className="overview-timeline">
          <div className="overview-timeline-header">
            <span>事项 / 空间</span>
            {timelineDays.map((day) => (
              <small key={day}>{day.slice(5)}</small>
            ))}
          </div>
          {items
            .filter((item) => item.start && item.start <= timelineDays.at(-1)! && item.end >= config.date)
            .map((item) => {
              const first = Math.max(
                0,
                timelineDays.findIndex((day) => day >= item.start),
              );
              const end = timelineDays.reduce((last, day, index) => (day <= item.end ? index : last), -1);
              return (
                <div className="overview-timeline-row" key={item.id}>
                  {card(item, true)}
                  <button
                    className={`overview-timeline-bar ${end - first < 4 ? 'short-bar' : ''}`}
                    data-label-side={end > 10 ? 'before' : 'after'}
                    style={{ ...recordAppearanceStyle(item, theme, workspace!.settings.appearance), gridColumn: `${first + 2} / ${end + 3}` }}
                    onClick={() => navigate(item.pageId)}
                    title={eventDescription(describeItem(item))}
                  >
                    <EventSummary info={describeItem(item)} kind={item.kind} />
                  </button>
                </div>
              );
            })}
        </div>
      ) : (
        <div className={`overview-groups ${config.view}`}>
          {groups.map((group) => (
            <div className="overview-group" key={group.name}>
              <h3>
                {group.name === dateKey(new Date()) ? '今天' : group.name}
                <small>{group.items.length}</small>
              </h3>
              {group.items.map((item) => card(item))}
            </div>
          ))}
        </div>
      )}
      {dayPanel && <Popover {...dayPanel} width={380} role="dialog" label={`${dayPanel.date} 的综合日程`} onClose={() => setDayPanel(null)}>
        <div className="event-detail-list"><header>{dayPanel.date} · 全部日程</header>
          {days.find(day => day.date === dayPanel.date)?.items.map(item => <button key={item.id} onClick={() => { setDayPanel(null); navigate(item.pageId, item.blockId); }}>
            <EventSummary info={describeItem(item)} kind={item.kind} detailed />
          </button>)}
        </div>
      </Popover>}
      {!items.length && (
        <div className="overview-empty">
          <ListTodo size={26} />
          <p>这里还没有符合条件的事项。</p>
          <button onClick={() => configure({ scope: 'all', query: '', hideCompleted: false })}>
            查看全部事项
          </button>
        </div>
      )}
    </section>
  );
}
