import { useState } from 'react';
import { Bell, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, Modal } from '../ui';
import { dateParts, localTimeZone, zonedDate } from '../database/dateValue';
import { reminderDue, reminderTimeZone } from './engine';
import type { Reminder } from './types';

export function DateReminderField({
  pageId,
  propertyId,
  onManage,
}: {
  pageId: string;
  propertyId: string;
  onManage: () => void;
}) {
  const { workspace, command, setModal, notify } = useWorkspace();
  const page = workspace!.pages.find((page) => page.id === pageId)!;
  if (!page) return null;
  const reminder = page.reminders?.find(
    (reminder) => reminder.propertyId === propertyId && !reminder.deletedAt,
  );
  const timed = !!dateParts(page.values[propertyId])?.start.includes('T');
  const options = timed
    ? [
        ['准时', 0, 'minutes'],
        ['提前 5 分钟', 5, 'minutes'],
        ['提前 15 分钟', 15, 'minutes'],
        ['提前 30 分钟', 30, 'minutes'],
        ['提前 1 小时', 60, 'minutes'],
        ['提前 1 天', 1, 'days'],
      ]
    : [
        ['当天 09:00', 0, 'days'],
        ['提前 1 天', 1, 'days'],
        ['提前 2 天', 2, 'days'],
        ['提前 1 周', 7, 'days'],
      ];
  const defaultZone = dateParts(page.values[propertyId])?.timeZone || localTimeZone();
  const standard =
    (!reminder?.timeZone || reminder.timeZone === defaultZone) &&
    (timed || !reminder?.dayTime || reminder.dayTime === '09:00');
  const value = reminder?.enabled
    ? `${reminder.offset ? reminder.unit || 'minutes' : timed ? 'minutes' : 'days'}:${reminder.offset || 0}`
    : 'none';
  return (
    <div className="date-reminder-field">
      <label>
        <Bell size={14} />
        <span>提醒</span>
        <select
          aria-label="日期提醒"
          value={
            (standard && options.some(([, n, unit]) => `${unit}:${n}` === value)) || value === 'none'
              ? value
              : 'custom'
          }
          onChange={(event) => {
            if (event.target.value === 'custom') {
              onManage();
              setModal({ type: 'reminder', pageId });
              return;
            }
            try {
              if (event.target.value === 'none') {
                if (reminder)
                  command('reminder.update', {
                    pageId,
                    reminderId: reminder.id,
                    changes: { enabled: false },
                  });
              } else {
                const [unit, offset] = event.target.value.split(':');
                const changes = {
                  enabled: true,
                  propertyId,
                  unit,
                  offset: Number(offset),
                  dayTime: '09:00',
                  timeZone: undefined,
                };
                command(reminder ? 'reminder.update' : 'reminder.add', {
                  pageId,
                  reminderId: reminder?.id,
                  changes,
                });
              }
            } catch (error) {
              notify(String(error));
            }
          }}
        >
          <option value="none">无</option>
          {options.map(([name, n, unit]) => (
            <option key={`${unit}:${n}`} value={`${unit}:${n}`}>
              {name}
            </option>
          ))}
          <option value="custom">自定义…</option>
        </select>
      </label>
      {reminder?.enabled && !reminderDue(page, reminder, workspace!) && (
        <small>填写日期后生效；模板中的提醒随新页面创建。</small>
      )}
    </div>
  );
}
export function ReminderDialog() {
  const { workspace, modal, setModal, command, notify } = useWorkspace();
  const page = workspace!.pages.find((page) => page.id === modal?.pageId)!;
  const columns =
    workspace!.pages
      .find((parent) => parent.id === page?.parentId)
      ?.database?.columns.filter((column) => column.type === 'date') || [];
  const fresh = () => ({
    text: '',
    mode: 'at',
    at: zonedDate(new Date(Date.now() + 3600000).toISOString(), localTimeZone())
      .toPlainDateTime()
      .toString({ smallestUnit: 'minute' }),
    propertyId: columns[0]?.id || '',
    offset: 0,
    unit: 'minutes',
    dayTime: '09:00',
    timeZone: localTimeZone(),
  });
  const [draft, setDraft] = useState(fresh),
    [editing, setEditing] = useState<string | null>(null),
    [deleted, setDeleted] = useState(false);
  if (!page) return null;
  const update = (value: Partial<typeof draft>) => setDraft({ ...draft, ...value });
  const action = (method: string, params: Record<string, unknown>) => {
    try {
      return command(method, { pageId: page.id, ...params });
    } catch (error) {
      notify(String(error));
      return null;
    }
  };
  const edit = (reminder: Reminder) => {
    setEditing(reminder.id);
    setDraft({
      ...fresh(),
      ...reminder,
      text: reminder.text || '',
      mode: reminder.propertyId ? 'property' : 'at',
      at: reminder.at
        ? zonedDate(reminder.at, reminder.timeZone || localTimeZone())
            .toPlainDateTime()
            .toString({ smallestUnit: 'minute' })
        : fresh().at,
      propertyId: reminder.propertyId || columns[0]?.id || '',
      unit: reminder.unit || 'minutes',
      offset: reminder.offset || 0,
      timeZone: reminder.propertyId ? reminder.timeZone || '' : reminder.timeZone || localTimeZone(),
    });
  };
  return (
    <Modal
      title={`提醒 · ${page.title || '无标题'}`}
      onClose={() => setModal(null)}
      className="reminder-dialog"
    >
      <div className="modal-body">
        <div className="reminder-list">
          {(page.reminders || [])
            .filter((item) => (deleted ? !!item.deletedAt : !item.deletedAt))
            .map((reminder) => {
              const due = reminderDue(page, reminder, workspace!),
                runtime = workspace!.scheduler?.reminders[reminder.id];
              return (
                <div className="reminder-row" key={reminder.id}>
                  <Bell size={15} />
                  <div>
                    <strong>{reminder.text || '页面提醒'}</strong>
                    <small>
                      {reminder.propertyId
                        ? `跟随「${columns.find((column) => column.id === reminder.propertyId)?.name || '已移除的属性'}」`
                        : '固定时间'}{' '}
                      ·{' '}
                      {!reminder.enabled
                        ? '已停用'
                        : runtime?.key === due && runtime.deliveredAt
                          ? '已提醒'
                          : due
                            ? zonedDate(
                                (runtime?.key === due && runtime.snoozedUntil) || due,
                                reminderTimeZone(page, reminder),
                              )
                                .toPlainDateTime()
                                .toString({ smallestUnit: 'minute' })
                                .replace('T', ' ') +
                              ' ' +
                              reminderTimeZone(page, reminder)
                            : '等待日期'}
                    </small>
                  </div>
                  {reminder.deletedAt ? (
                    <IconButton
                      label="恢复提醒"
                      onClick={() => action('reminder.restore', { reminderId: reminder.id })}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        aria-label={`启用 ${reminder.text || '页面提醒'}`}
                        checked={reminder.enabled}
                        onChange={(event) =>
                          action('reminder.update', {
                            reminderId: reminder.id,
                            changes: { enabled: event.target.checked },
                          })
                        }
                      />
                      <IconButton label="编辑提醒" onClick={() => edit(reminder)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        label="删除提醒"
                        onClick={() => {
                          if (action('reminder.delete', { reminderId: reminder.id }))
                            notify('提醒已删除', () =>
                              action('reminder.restore', { reminderId: reminder.id }),
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </>
                  )}
                </div>
              );
            })}
        </div>
        <button className="text-button" onClick={() => setDeleted(!deleted)}>
          {deleted ? '查看当前提醒' : '查看已删除提醒'}
        </button>
        <form
          className="reminder-form"
          onSubmit={(event) => {
            event.preventDefault();
            const changes = {
              ...(editing ? {} : { enabled: true }),
              text: draft.text,
              timeZone: draft.timeZone,
              ...(draft.mode === 'at'
                ? { at: draft.at }
                : {
                    propertyId: draft.propertyId,
                    offset: draft.offset,
                    unit: draft.unit,
                    dayTime: draft.dayTime,
                  }),
            };
            if (action(editing ? 'reminder.update' : 'reminder.add', { reminderId: editing, changes })) {
              setEditing(null);
              setDraft(fresh());
              notify('提醒已保存');
            }
          }}
        >
          <h4>{editing ? '编辑提醒' : '添加提醒'}</h4>
          <label className="field-label">
            提醒内容
            <input
              aria-label="提醒内容"
              value={draft.text}
              placeholder="该查看这页笔记了"
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <label className="field-label">
            提醒方式
            <select
              aria-label="提醒方式"
              value={draft.mode}
              onChange={(event) =>
                update({
                  mode: event.target.value,
                  timeZone: event.target.value === 'property' ? '' : draft.timeZone || localTimeZone(),
                })
              }
            >
              <option value="at">固定时间</option>
              {!!columns.length && <option value="property">跟随日期属性</option>}
            </select>
          </label>
          {draft.mode === 'at' ? (
            <label className="field-label">
              提醒时间
              <input
                type="datetime-local"
                aria-label="提醒时间"
                required
                value={draft.at}
                onChange={(event) => update({ at: event.target.value })}
              />
            </label>
          ) : (
            <>
              <label className="field-label">
                日期属性
                <select
                  aria-label="提醒日期属性"
                  value={draft.propertyId}
                  onChange={(event) => update({ propertyId: event.target.value })}
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="schedule-field-row">
                <label className="field-label">
                  提前量
                  <input
                    type="number"
                    aria-label="提醒提前量"
                    value={draft.offset}
                    onChange={(event) => update({ offset: Number(event.target.value) })}
                  />
                </label>
                <label className="field-label">
                  单位
                  <select
                    aria-label="提醒提前单位"
                    value={draft.unit}
                    onChange={(event) => update({ unit: event.target.value })}
                  >
                    <option value="minutes">分钟</option>
                    <option value="days">日历天</option>
                  </select>
                </label>
              </div>
              <label className="field-label">
                未包含时间时
                <input
                  type="time"
                  aria-label="全天提醒时间"
                  value={draft.dayTime}
                  onChange={(event) => update({ dayTime: event.target.value })}
                />
                <small>负的提前量表示日期之后。</small>
              </label>
            </>
          )}
          <label className="field-label">
            时区
            <select
              aria-label="提醒时区"
              value={draft.timeZone}
              onChange={(event) => update({ timeZone: event.target.value })}
            >
              {draft.mode === 'property' && <option value="">跟随日期属性</option>}
              {[...new Set([draft.timeZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])]
                .filter(Boolean)
                .map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
            </select>
          </label>
          <div className="modal-actions">
            {editing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(null);
                  setDraft(fresh());
                }}
              >
                取消编辑
              </button>
            )}
            <button className="primary-button">保存提醒</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
