import { EventState } from '../components/EventSummary';
import {AppSelect} from '../components/AppSelect';
import { useState } from 'react';
import { Archive, ArchiveRestore, Bell, CheckCheck, Clock, Circle, Zap } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, Modal, relativeDate } from '../ui';

export function Inbox() {
  const { workspace, setModal, command, navigate, notify } = useWorkspace();
  const [tab, setTab] = useState('active');
  const items = (workspace!.inbox || [])
    .filter((item) =>
      tab === 'archived' ? !!item.archivedAt : !item.archivedAt && (tab !== 'unread' || !item.readAt),
    )
    .slice()
    .reverse();
  const action = (method: string, params: any) => {
    try {
      return command(method, params);
    } catch (error) {
      notify(String(error));
      return null;
    }
  };
  return (
    <Modal title="收件箱" onClose={() => setModal(null)} wide className="inbox-dialog">
      <div className="modal-body">
        <div className="inbox-toolbar">
          <div className="schedule-tabs">
            {[
              ['active', '全部'],
              ['unread', '未读'],
              ['archived', '已归档'],
            ].map(([id, label]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => action('inbox.read', { all: true })}>
            <CheckCheck size={15} />
            全部已读
          </button>
          <button className="text-button" onClick={() => setModal({ type: 'scheduler' })}>
            <Clock size={15} />
            管理计划
          </button>
        </div>
        <div className="inbox-items">
          {items.length ? (
            items.map((item) => {
              const page = workspace!.pages.find((page) => page.id === item.pageId && !page.trashedAt),
                reminder = page?.reminders?.find(
                  (reminder) => reminder.id === item.reminderId && !reminder.deletedAt && reminder.enabled,
                );
              return (
                <article
                  className={`inbox-item ${item.readAt ? '' : 'unread'}`}
                  key={item.id}
                  data-notification-id={item.id}
                >
                  <div className="inbox-bell">
                    {item.kind === 'automation' ? <Zap size={19} /> : <Bell size={19} />}
                  </div>
                  <div className="inbox-item-content">
                    <button
                      className="inbox-page"
                      disabled={!page}
                      onClick={() => {
                        action('inbox.read', { id: item.id });
                        setModal(null);
                        navigate(item.pageId);
                      }}
                    >
                      {page?.title || item.title || '无标题'}
                      {!page && <small> · 页面已移除</small>}
                    </button>
                    <EventState tone={item.readAt ? 'neutral' : 'scheduled'}>{`${item.kind === 'automation' ? '自动化通知' : '到期提醒'} · ${item.archivedAt ? '已归档' : item.readAt ? '已读' : '未读'}`}</EventState>
                    <p>{item.text}</p>
                    <small title={new Date(item.createdAt).toLocaleString('zh-CN')}>
                      到期于 {new Date(item.scheduledFor).toLocaleString('zh-CN')} ·{' '}
                      {relativeDate(item.createdAt)}
                    </small>
                  </div>
                  <div className="inbox-item-actions">
                    <IconButton
                      label={item.readAt ? '标为未读' : '标为已读'}
                      onClick={() => action(item.readAt ? 'inbox.unread' : 'inbox.read', { id: item.id })}
                    >
                      {item.readAt ? <Circle size={14} /> : <CheckCheck size={14} />}
                    </IconButton>
                    <IconButton
                      label={item.archivedAt ? '取消归档' : '归档通知'}
                      onClick={() =>
                        action(item.archivedAt ? 'inbox.restore' : 'inbox.archive', { id: item.id })
                      }
                    >
                      {item.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </IconButton>
                    {reminder && !item.archivedAt && (
                      <AppSelect
                        aria-label="稍后提醒"
                        value=""
                        onChange={(event) => {
                          if (event.target.value)
                            action('reminder.snooze', {
                              pageId: item.pageId,
                              reminderId: item.reminderId,
                              inboxId: item.id,
                              until: new Date(Date.now() + Number(event.target.value) * 60000).toISOString(),
                            });
                        }}
                      >
                        <option value="">稍后提醒</option>
                        <option value="5">5 分钟后</option>
                        <option value="60">1 小时后</option>
                        <option value="1440">明天此时</option>
                      </AppSelect>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="inbox-empty">
              <Bell size={36} />
              <h3>暂时没有通知</h3>
              <p>到期提醒会保存在这里。</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
