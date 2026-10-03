import {AppSelect} from '../components/AppSelect';
import { ScheduleFields } from './ScheduleFields';
import { useMemo, useState } from 'react';
import { RefreshCw, CalendarClock } from 'lucide-react';
import { Modal } from '../ui';
import { useWorkspace } from '../store';
import { defaultRule } from './commands';
import { repeatOccurrences, validateRepeat } from './recurrence';
import { zonedDate } from '../database/dateValue';
import type { RepeatRule } from './types';

export function RepeatDialog() {
  const { workspace, modal, setModal, command, notify } = useWorkspace();
  const template = workspace!.pages.find((page) => page.id === modal?.pageId)!;
  const database = workspace!.pages.find((page) => page.id === template?.templateFor);
  const dates = database?.database?.columns.filter((column) => column.type === 'date') || [];
  const [draft, setDraft] = useState<RepeatRule>(
    () => template?.repeat || { ...defaultRule(), dateProperty: dates[0]?.id },
  );
  const change = (changes: Partial<RepeatRule>) => setDraft({ ...draft, ...changes });
  const preview = useMemo(() => {
    try {
      validateRepeat(draft);
      return { dates: repeatOccurrences(draft, Date.now(), 4), error: '' };
    } catch (error) {
      return { dates: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [draft]);
  if (!template) return null;
  return (
    <Modal title="循环模板" onClose={() => setModal(null)} className="repeat-dialog">
      <form
        className="modal-body"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            command('repeat.configure', { templateId: template.id, rule: draft });
            setModal(null);
            notify(draft.enabled ? '循环计划已启用' : '循环设置已保存');
          } catch (error) {
            notify(String(error));
          }
        }}
      >
        <div className="schedule-source">
          <RefreshCw size={18} />
          <div>
            <strong>{template.title || '无标题模板'}</strong>
            <small>{database?.title || '数据库'}</small>
          </div>
          <label>
            <input
              type="checkbox"
              aria-label="启用循环"
              checked={draft.enabled}
              onChange={(event) => change({ enabled: event.target.checked })}
            />
            启用
          </label>
        </div>
        <ScheduleFields rule={draft} onChange={change} />
        <details className="repeat-fields">
          <summary>
            生成页面设置
            <small>
              {draft.titlePattern || '沿用模板名称'} ·{' '}
              {dates.find((column) => column.id === draft.dateProperty)?.name || '不填写日期'}
            </small>
          </summary>
          <label className="field-label">
            新页面名称
            <input
              aria-label="循环页面名称"
              value={draft.titlePattern || ''}
              placeholder={template.title || '沿用模板名称'}
              onChange={(event) => change({ titlePattern: event.target.value })}
            />
            <small>
              可使用 {'{date}'}、{'{time}'}、{'{weekday}'}，例如「每日计划 {'{date}'}」。
            </small>
          </label>
          <label className="field-label">
            自动填写日期
            <AppSelect
              aria-label="循环日期属性"
              value={draft.dateProperty || ''}
              onChange={(event) => change({ dateProperty: event.target.value })}
            >
              <option value="">不自动填写</option>
              {dates.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </AppSelect>
          </label>
          {draft.dateProperty && (
            <>
              <div className="schedule-field-row">
                <label className="field-label">
                  相隔天数
                  <input
                    aria-label="循环日期偏移"
                    type="number"
                    value={draft.dateOffsetDays || 0}
                    onChange={(event) => change({ dateOffsetDays: Number(event.target.value) })}
                  />
                </label>
                <label className="schedule-checkbox">
                  <input
                    type="checkbox"
                    aria-label="循环日期包含时间"
                    checked={!!draft.includeTime}
                    onChange={(event) => change({ includeTime: event.target.checked })}
                  />
                  包含生成时刻
                </label>
              </div>
              {draft.includeTime && (
                <label className="field-label">
                  持续分钟数（0 表示无结束时间）
                  <input
                    aria-label="循环持续分钟数"
                    type="number"
                    min={0}
                    value={draft.durationMinutes || 0}
                    onChange={(event) => change({ durationMinutes: Number(event.target.value) })}
                  />
                </label>
              )}
              <label className="schedule-checkbox">
                <input
                  type="checkbox"
                  checked={!!draft.shiftDates}
                  aria-label="平移其他日期"
                  onChange={(event) => change({ shiftDates: event.target.checked })}
                />
                以模板日期为基准，平移其他日期和子项目
              </label>
            </>
          )}
        </details>
        <div className="repeat-preview">
          <strong>接下来的生成时间</strong>
          <small>{draft.timeZone} · 预览，尚未生成页面</small>
          {preview.error ? (
            <p role="alert">{preview.error}</p>
          ) : preview.dates.length ? (
            preview.dates.map((at) => (
              <span key={at}>
                <CalendarClock size={14} aria-hidden="true" />
                {zonedDate(new Date(at).toISOString(), draft.timeZone)
                  .toPlainDateTime()
                  .toString({ smallestUnit: 'minute' })
                  .replace('T', ' ')}
              </span>
            ))
          ) : (
            <span>此规则已没有未来的生成时间</span>
          )}
          <small>保存后生效；已错过的时刻按所选补发策略处理。</small>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={() => setModal(null)}>
            取消
          </button>
          <button
            className="primary-button"
            disabled={!!preview.error || template.locked || database?.locked}
          >
            保存循环
          </button>
        </div>
      </form>
    </Modal>
  );
}
