import {AppSelect} from '../components/AppSelect';
import { useState } from 'react';
import { DateReminderField } from '../scheduling/Reminders';
import { Calendar, ChevronLeft, ChevronRight, Clock, Globe2, X } from 'lucide-react';
import type { DateValue } from '../types';
import { IconButton, Popover } from '../ui';
import { addDays, dateKey, parseDay } from './dates';
import { dateParts, dateText, dateWall, hasTime, localTimeZone, makeDateValue, zonedDate } from './dateValue';

type Props = {
  value: unknown;
  onChange: (value: string | DateValue) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  pageId?: string;
  propertyId?: string;
  compact?: boolean;
};
export function DateInput({ value, onChange, label, disabled, required, pageId, propertyId, compact }: Props) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const short = (text: string) => text ? `${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))}${text.includes('T') ? ` ${text.slice(11, 16)}` : ''}` : '';
  const start = dateWall(value), end = dateParts(value)?.end ? dateWall(value, 'end') : '';
  const display = compact ? short(start) + (end && end !== start ? ` → ${short(end)}` : '') : dateText(value);
  return (
    <div className="date-property" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`date-property-value ${value ? '' : 'empty'}`}
        aria-label={label}
        disabled={disabled}
        title={dateText(value)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        <Calendar size={13} />
        <span>{display || '空'}</span>
      </button>
      {required && (
        <input
          className="date-required-input"
          aria-label={`${label}（必填）`}
          tabIndex={-1}
          required
          value={dateWall(value)}
          onChange={() => {}}
          onInvalid={(event) => {
            const rect = event.currentTarget.parentElement!.getBoundingClientRect();
            setPosition({ x: rect.left, y: rect.bottom + 4 });
          }}
        />
      )}
      {position && (
        <Popover {...position} width={310} onClose={() => setPosition(null)}>
          <DatePicker
            value={value}
            onChange={onChange}
            pageId={pageId}
            propertyId={propertyId}
            onClose={() => setPosition(null)}
          />
        </Popover>
      )}
    </div>
  );
}
function DatePicker({
  value,
  onChange,
  onClose,
  pageId,
  propertyId,
}: Pick<Props, 'value' | 'onChange' | 'pageId' | 'propertyId'> & { onClose: () => void }) {
  const parts = dateParts(value);
  const [draft, setDraft] = useState({
    start: dateWall(value) || dateKey(new Date()),
    end: parts?.end ? dateWall(value, 'end') : '',
    timeZone: parts?.timeZone || localTimeZone(),
  });
  const [target, setTarget] = useState<'start' | 'end'>('start');
  const [month, setMonth] = useState(parseDay(value) || new Date());
  const [error, setError] = useState('');
  const timed = hasTime(draft.start);
  const update = (changes: Partial<typeof draft>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    try {
      onChange(makeDateValue(next.start, next.end, timed || hasTime(next.start) ? next.timeZone : undefined));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const setZone = (timeZone: string) => {
    const convert = (text: string) =>
      text && hasTime(text)
        ? zonedDate(text, draft.timeZone)
            .withTimeZone(timeZone)
            .toPlainDateTime()
            .toString({ smallestUnit: 'minute' })
        : text;
    update({ timeZone, start: convert(draft.start), end: convert(draft.end) });
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index - ((first.getDay() + 6) % 7)));
  const zones = [...new Set([draft.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])];
  return (
    <div
      className="date-picker"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        event.stopPropagation();
      }}
    >
      <div className="date-picker-fields">
        <label>
          开始日期
          <input
            aria-label="开始日期"
            type={timed ? 'datetime-local' : 'date'}
            value={draft.start}
            onFocus={() => setTarget('start')}
            onChange={(event) => {
              update({ start: event.target.value });
              const day = parseDay(event.target.value);
              if (day) setMonth(day);
            }}
          />
        </label>
        {draft.end && (
          <label>
            结束日期
            <input
              aria-label="结束日期"
              type={timed ? 'datetime-local' : 'date'}
              value={draft.end}
              onFocus={() => setTarget('end')}
              onChange={(event) => update({ end: event.target.value })}
            />
          </label>
        )}
      </div>
      <div className="date-picker-month">
        <strong>
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </strong>
        <IconButton
          label="上个月"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={15} />
        </IconButton>
        <IconButton
          label="下个月"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={15} />
        </IconButton>
      </div>
      <div className="date-picker-calendar">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <small key={day}>{day}</small>
        ))}
        {days.map((day) => {
          const key = dateKey(day),
            start = draft.start.slice(0, 10),
            end = draft.end.slice(0, 10);
          return (
            <button
              type="button"
              key={key}
              aria-label={`选择 ${key}`}
              className={`${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === start || key === end ? 'selected' : ''} ${key > start && key < end ? 'in-range' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
              onClick={() => {
                const endpoint = draft.end ? target : 'start',
                  text = key + draft[endpoint].slice(10);
                update(
                  endpoint === 'start'
                    ? { start: text, ...(draft.end && text > draft.end ? { end: text } : {}) }
                    : { end: text },
                );
                if (draft.end) setTarget(endpoint === 'start' ? 'end' : 'start');
                else if (!timed) onClose();
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="date-picker-options">
        <label>
          <Calendar size={14} />
          结束日期
          <input
            type="checkbox"
            aria-label="包含结束日期"
            checked={!!draft.end}
            onChange={(event) => {
              update({ end: event.target.checked ? draft.start : '' });
              setTarget(event.target.checked ? 'end' : 'start');
            }}
          />
        </label>
        <label>
          <Clock size={14} />
          包含时间
          <input
            type="checkbox"
            aria-label="包含时间"
            checked={timed}
            onChange={(event) =>
              update({
                start: draft.start.slice(0, 10) + (event.target.checked ? 'T09:00' : ''),
                end: draft.end ? draft.end.slice(0, 10) + (event.target.checked ? 'T18:00' : '') : '',
              })
            }
          />
        </label>
        {timed && (
          <label className="date-timezone">
            <Globe2 size={14} />
            <span>时区</span>
            <AppSelect
              aria-label="日期时区"
              value={draft.timeZone}
              onChange={(event) => setZone(event.target.value)}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </AppSelect>
          </label>
        )}
      </div>
      {pageId && propertyId && (
        <DateReminderField pageId={pageId} propertyId={propertyId} onManage={onClose} />
      )}
      {error && (
        <p role="alert" className="date-picker-error">
          {error}
        </p>
      )}
      <div className="date-picker-footer">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange('');
            onClose();
          }}
        >
          <X size={13} />
          清空
        </button>
        <button type="button" className="primary-button" disabled={!!error} onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}
