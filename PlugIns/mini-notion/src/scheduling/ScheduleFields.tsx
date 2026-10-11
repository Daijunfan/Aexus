import {AppSelect} from '../components/AppSelect';
import type { RepeatRule } from './types';
export function ScheduleFields({
  rule: draft,
  onChange: change,
}: {
  rule: RepeatRule;
  onChange: (changes: Partial<RepeatRule>) => void;
}) {
  return (
    <>
      <div className="schedule-field-row">
        <label className="field-label">
          重复周期
          <AppSelect
            aria-label="重复周期"
            value={draft.frequency}
            onChange={(event) => change({ frequency: event.target.value as RepeatRule['frequency'] })}
          >
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="yearly">每年</option>
          </AppSelect>
        </label>
        <label className="field-label">
          每隔
          <input
            aria-label="循环间隔"
            type="number"
            min={1}
            value={draft.interval}
            onChange={(event) => change({ interval: Number(event.target.value) })}
          />
        </label>
      </div>
      {draft.frequency === 'weekly' && (
        <div className="repeat-weekdays" aria-label="每周重复日期">
          {['一', '二', '三', '四', '五', '六', '日'].map((day, index) => (
            <button
              type="button"
              key={day}
              aria-label={`每周${day}`}
              aria-pressed={draft.weekdays?.includes(index + 1)}
              className={draft.weekdays?.includes(index + 1) ? 'selected' : ''}
              onClick={() =>
                change({
                  weekdays: draft.weekdays?.includes(index + 1)
                    ? draft.weekdays.filter((value) => value !== index + 1)
                    : [...(draft.weekdays || []), index + 1],
                })
              }
            >
              {day}
            </button>
          ))}
        </div>
      )}
      {['monthly', 'yearly'].includes(draft.frequency) && (
        <>
          <label className="field-label">
            月内规则
            <AppSelect
              aria-label="月内规则"
              value={draft.monthMode || 'day'}
              onChange={(event) =>
                change({
                  monthMode: event.target.value as RepeatRule['monthMode'],
                  ordinal: draft.ordinal || 1,
                  weekday: draft.weekday || 1,
                })
              }
            >
              <option value="day">指定日期</option>
              <option value="lastDay">最后一天</option>
              <option value="nthWeekday">第几个星期几</option>
            </AppSelect>
          </label>
          {draft.monthMode === 'nthWeekday' ? (
            <div className="schedule-field-row">
              <AppSelect
                aria-label="第几个星期"
                value={draft.ordinal || 1}
                onChange={(event) => change({ ordinal: Number(event.target.value) })}
              >
                {[1, 2, 3, 4, -1].map((value) => (
                  <option key={value} value={value}>
                    {value === -1 ? '最后一个' : `第 ${value} 个`}
                  </option>
                ))}
              </AppSelect>
              <AppSelect
                aria-label="星期几"
                value={draft.weekday || 1}
                onChange={(event) => change({ weekday: Number(event.target.value) })}
              >
                {['一', '二', '三', '四', '五', '六', '日'].map((day, index) => (
                  <option key={day} value={index + 1}>
                    星期{day}
                  </option>
                ))}
              </AppSelect>
            </div>
          ) : (
            draft.monthMode !== 'lastDay' && (
              <label className="field-label">
                每月几号
                <input
                  type="number"
                  min={1}
                  max={31}
                  aria-label="每月几号"
                  value={draft.monthDay || Number(draft.startDate.slice(8))}
                  onChange={(event) => change({ monthDay: Number(event.target.value) })}
                />
                <small>短月份使用该月最后一天。</small>
              </label>
            )
          )}
        </>
      )}
      <div className="schedule-field-row">
        <label className="field-label">
          开始日期
          <input
            type="date"
            aria-label="循环开始日期"
            value={draft.startDate}
            onChange={(event) => change({ startDate: event.target.value })}
          />
        </label>
        <label className="field-label">
          生成时间
          <input
            type="time"
            aria-label="循环生成时间"
            value={draft.time}
            onChange={(event) => change({ time: event.target.value })}
          />
        </label>
      </div>
      <label className="field-label">
        时区
        <AppSelect
          aria-label="循环时区"
          value={draft.timeZone}
          onChange={(event) => change({ timeZone: event.target.value })}
        >
          {[...new Set([draft.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])].map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </AppSelect>
      </label>
      <div className="schedule-field-row">
        <label className="field-label">
          结束日期（可选）
          <input
            type="date"
            aria-label="循环结束日期"
            value={draft.endDate || ''}
            onChange={(event) => change({ endDate: event.target.value })}
          />
        </label>
        <label className="field-label">
          错过计划时
          <AppSelect
            aria-label="循环补发策略"
            value={draft.catchUp}
            onChange={(event) => change({ catchUp: event.target.value as RepeatRule['catchUp'] })}
          >
            <option value="latest">补最近一次</option>
            <option value="all">补全部</option>
            <option value="skip">跳过</option>
          </AppSelect>
        </label>
      </div>
    </>
  );
}
