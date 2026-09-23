import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Pause, Play, Pencil, ArrowUpRight, Bell } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, Modal } from '../ui';
import { schedulingStatus } from './engine';
import { repeatLabel } from './recurrence';
import { zonedDate } from '../database/dateValue';

export function SchedulerDialog() {
  const { workspace, setModal, command, api, navigate, notify } = useWorkspace();
  const [tab, setTab] = useState('repeats'),
    [status, setStatus] = useState<any>(() => schedulingStatus(workspace!)),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setStatus(window.native ? await api('scheduler.status') : command('scheduler.status'));
    } catch (error) {
      notify(String(error));
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, []);
  const action = (method: string, params: any) => {
    try {
      command(method, params);
      void refresh();
    } catch (error) {
      notify(String(error));
    }
  };
  return (
    <Modal title="本地计划" onClose={() => setModal(null)} wide className="scheduler-dialog">
      <div className="modal-body">
        <div className="schedule-overview">
          <Clock size={20} />
          <div>
            <strong>自动生成页面，按时提醒自己</strong>
            <small>本地后台运行。休眠或关机期间错过的计划，会在后台再次运行时按补发策略处理。</small>
          </div>
          <button
            className="secondary-button"
            disabled={busy || !window.native}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api('scheduler.run');
                notify(`生成 ${result.runs.length} 页，处理 ${result.notifications.length} 条提醒`);
                await refresh();
              } catch (error) {
                notify(String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={14} />
            检查到期计划
          </button>
        </div>
        {status.backgroundError && (
          <p className="schedule-error" role="alert">
            {status.backgroundError}
          </p>
        )}
        <div className="schedule-tabs">
          {[
            ['repeats', '循环模板'],
            ['reminders', '提醒'],
            ['history', '运行记录'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="schedule-list">
          {tab === 'repeats' &&
            (status.repeats.length ? (
              status.repeats.map((item: any) => (
                <article className="schedule-row" key={item.templateId}>
                  <RefreshCw size={16} />
                  <div>
                    <strong>{item.title || '无标题模板'}</strong>
                    <small>
                      {repeatLabel(item.rule)} · {item.rule.timeZone}
                    </small>
                    <small>
                      {item.runtime?.error ? (
                        <span className="schedule-error">{item.runtime.error}</span>
                      ) : !item.available ? (
                        '模板或数据库不可用'
                      ) : item.nextAt ? (
                        `下次：${new Date(item.nextAt).toLocaleString('zh-CN', { timeZone: item.rule.timeZone })}`
                      ) : (
                        '未启用或已结束'
                      )}
                    </small>
                  </div>
                  <IconButton
                    label="编辑循环"
                    onClick={() => setModal({ type: 'repeat', pageId: item.templateId })}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label={item.rule.enabled ? '暂停循环' : '恢复循环'}
                    onClick={() =>
                      action(item.rule.enabled ? 'repeat.pause' : 'repeat.resume', {
                        templateId: item.templateId,
                      })
                    }
                  >
                    {item.rule.enabled ? <Pause size={15} /> : <Play size={15} />}
                  </IconButton>
                  <button
                    className="text-button"
                    disabled={!item.available}
                    onClick={() => action('repeat.run', { templateId: item.templateId })}
                  >
                    生成一次
                  </button>
                </article>
              ))
            ) : (
              <div className="schedule-empty">
                <RefreshCw size={28} />
                <p>在数据库模板的「··· → 重复」中设置循环。</p>
              </div>
            ))}
          {tab === 'reminders' &&
            (status.reminders.length ? (
              status.reminders.map((item: any) => (
                <article className="schedule-row" key={item.id}>
                  <Bell size={16} />
                  <div>
                    <strong>{item.text || item.pageTitle || '页面提醒'}</strong>
                    <small>
                      {item.pageTitle || '无标题'} ·{' '}
                      {!item.enabled
                        ? '已停用'
                        : item.deliveredAt
                          ? '已提醒'
                          : item.dueAt
                            ? zonedDate(item.dueAt, item.displayTimeZone)
                                .toPlainDateTime()
                                .toString({ smallestUnit: 'minute' })
                                .replace('T', ' ') +
                              ' ' +
                              item.displayTimeZone
                            : '等待日期'}
                    </small>
                  </div>
                  <IconButton
                    label="编辑页面提醒"
                    disabled={item.pageTrashed}
                    onClick={() => setModal({ type: 'reminder', pageId: item.pageId })}
                  >
                    <Pencil size={14} />
                  </IconButton>
                </article>
              ))
            ) : (
              <div className="schedule-empty">
                <Bell size={28} />
                <p>在页面顶部或日期属性中添加提醒。</p>
              </div>
            ))}
          {tab === 'history' &&
            (workspace!.scheduler?.runs.length || 0 ? (
              workspace!
                .scheduler!.runs.slice()
                .reverse()
                .map((run) => (
                  <article className="schedule-row" key={run.id}>
                    <RefreshCw size={15} />
                    <div>
                      <strong>{run.title || '无标题'}</strong>
                      <small>
                        {run.manual ? '手动生成' : '循环生成'} · 计划时间{' '}
                        {new Date(run.scheduledFor).toLocaleString('zh-CN')}
                      </small>
                      <small>生成于 {new Date(run.createdAt).toLocaleString('zh-CN')}</small>
                    </div>
                    <IconButton
                      label="打开生成页面"
                      disabled={!workspace!.pages.some((page) => page.id === run.pageId && !page.trashedAt)}
                      onClick={() => {
                        setModal(null);
                        navigate(run.pageId);
                      }}
                    >
                      <ArrowUpRight size={16} />
                    </IconButton>
                  </article>
                ))
            ) : (
              <div className="schedule-empty">
                <Clock size={28} />
                <p>还没有生成记录。</p>
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}
