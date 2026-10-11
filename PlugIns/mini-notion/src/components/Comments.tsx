import {AppSelect} from './AppSelect';
import { useEffect, useState } from 'react';
import { Check, MessageSquare, Pencil, RotateCcw, Send, Smile, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../store';
import { flattenBlocks } from '../core/blocks';
import { IconButton, relativeDate } from '../ui';
import type { CommentMessage, CommentThread } from '../types';

export function Comments() {
  const { workspace, commentPanel: panel, setCommentPanel, command, notify } = useWorkspace();
  const page = workspace!.pages.find((page) => page.id === panel?.pageId);
  const [status, setStatus] = useState('open');
  const [draft, setDraft] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ thread: string; id: string; text: string } | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  useEffect(() => {
    setDraft('');
    setStatus('open');
  }, [panel?.pageId, panel?.blockId]);
  if (!page || !panel) return null;
  const execute = (method: string, params: Record<string, any>) => {
    try {
      return command(method, { pageId: page.id, ...params });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  const threads = (page.comments || []).filter((thread) =>
    status === 'deleted'
      ? thread.deletedAt || thread.messages.some((message) => message.deletedAt)
      : !thread.deletedAt &&
        (status === 'all' || (status === 'resolved' ? !!thread.resolvedAt : !thread.resolvedAt)),
  );
  const jump = (thread: CommentThread) => {
    const editor = document.querySelector(`[data-editor-page="${CSS.escape(page.id)}"]`);
    const block = editor?.querySelector<HTMLElement>(`[data-id="${CSS.escape(thread.blockId || '')}"]`);
    if (!block) {
      notify('原内容目前未显示，讨论中的摘录仍然保留');
      return;
    }
    block.scrollIntoView({ block: 'center', behavior: 'smooth' });
    block.classList.add('comment-highlight');
    setTimeout(() => block.classList.remove('comment-highlight'), 2200);
  };
  const remove = (thread: CommentThread, message?: CommentMessage) => {
    if (execute('comment.delete', { threadId: thread.id, commentId: message?.id }))
      notify('评论已删除', () => execute('comment.restore', { threadId: thread.id, commentId: message?.id }));
  };
  const content = (text: string) =>
    text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={index}
          href={part}
          onClick={(event) => {
            if (window.native) {
              event.preventDefault();
              void window.native.openExternal(part);
            }
          }}
        >
          {part}
        </a>
      ) : (
        part
      ),
    );
  return (
    <aside className="comments-panel" aria-label="页面评论">
      <header>
        <MessageSquare size={17} />
        <strong>评论</strong>
        <IconButton label="关闭评论" onClick={() => setCommentPanel(null)}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="comments-scope">
        <span>{page.title || '无标题'}</span>
        <AppSelect aria-label="评论状态" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="open">待处理</option>
          <option value="resolved">已解决</option>
          <option value="all">全部</option>
          <option value="deleted">已删除</option>
        </AppSelect>
      </div>
      <div className="comment-thread-list">
        {!threads.length && (
          <div className="comments-empty">
            <MessageSquare size={27} />
            <p>{status === 'open' ? '在这里记录问题、想法与反馈' : '没有此类评论'}</p>
          </div>
        )}
        {threads.map((thread) => (
          <article
            className={`comment-thread ${thread.resolvedAt ? 'resolved' : ''} ${thread.id === panel.threadId ? 'selected' : ''}`}
            key={thread.id}
            data-thread-id={thread.id}
          >
            {thread.quote && (
              <button className="comment-quote" onClick={() => jump(thread)}>
                {thread.quote}
                {thread.blockId &&
                  !flattenBlocks(page.blocks).some((item) => item.block.id === thread.blockId) && (
                    <small>原内容已移除</small>
                  )}
              </button>
            )}
            <div className="thread-actions">
              <small>
                {thread.blockId ? '内容评论' : '页面讨论'}
                {thread.resolvedAt ? ' · 已解决' : ''}
              </small>
              {thread.deletedAt ? (
                <IconButton
                  label="恢复讨论"
                  onClick={() => execute('comment.restore', { threadId: thread.id })}
                >
                  <RotateCcw size={14} />
                </IconButton>
              ) : (
                <>
                  <IconButton
                    label={thread.resolvedAt ? '重新打开讨论' : '解决讨论'}
                    onClick={() =>
                      execute(thread.resolvedAt ? 'comment.reopen' : 'comment.resolve', {
                        threadId: thread.id,
                      })
                    }
                  >
                    {thread.resolvedAt ? <RotateCcw size={14} /> : <Check size={14} />}
                  </IconButton>
                  <IconButton label="删除讨论" onClick={() => remove(thread)}>
                    <Trash2 size={13} />
                  </IconButton>
                </>
              )}
            </div>
            {thread.messages
              .filter((message) => status === 'deleted' || !message.deletedAt)
              .map((message) => (
                <div
                  className={`comment-message ${message.deletedAt ? 'deleted' : ''}`}
                  key={message.id}
                  data-comment-id={message.id}
                >
                  <div className="comment-author">
                    <span>{Array.from(message.author)[0] || '我'}</span>
                    <strong>{message.author}</strong>
                    <time title={new Date(message.createdAt).toLocaleString()}>
                      {relativeDate(message.createdAt)}
                    </time>
                    {message.updatedAt > message.createdAt && <small>已编辑</small>}
                  </div>
                  {editing?.id === message.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (
                          execute('comment.update', {
                            threadId: thread.id,
                            commentId: message.id,
                            text: editing.text,
                          })
                        )
                          setEditing(null);
                      }}
                    >
                      <textarea
                        aria-label="编辑评论内容"
                        value={editing.text}
                        onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                      />
                      <div className="comment-compose-actions">
                        <button type="button" className="text-button" onClick={() => setEditing(null)}>
                          取消
                        </button>
                        <button className="primary-button" disabled={!editing.text.trim()}>
                          保存
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="comment-text">{content(message.text)}</p>
                  )}
                  <div className="comment-message-actions" hidden={!!thread.deletedAt}>
                    {message.deletedAt ? (
                      <button
                        className="text-button"
                        onClick={() =>
                          execute('comment.restore', { threadId: thread.id, commentId: message.id })
                        }
                      >
                        恢复评论
                      </button>
                    ) : (
                      <>
                        <IconButton
                          label="添加表情反馈"
                          onClick={() => setReaction(reaction === message.id ? null : message.id)}
                        >
                          <Smile size={13} />
                        </IconButton>
                        <IconButton
                          label="编辑评论"
                          onClick={() =>
                            setEditing({ thread: thread.id, id: message.id, text: message.text })
                          }
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton label="删除这条评论" onClick={() => remove(thread, message)}>
                          <Trash2 size={13} />
                        </IconButton>
                        {Object.entries(message.reactions || {})
                          .filter(([, active]) => active)
                          .map(([emoji]) => (
                            <button
                              className="comment-reaction"
                              key={emoji}
                              onClick={() =>
                                execute('comment.react', {
                                  threadId: thread.id,
                                  commentId: message.id,
                                  emoji,
                                })
                              }
                            >
                              {emoji} 1
                            </button>
                          ))}
                      </>
                    )}
                  </div>
                  {!thread.deletedAt && reaction === message.id && (
                    <div className="comment-reactions">
                      {['👍', '❤️', '✅', '👀', '💡', '🎉'].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            execute('comment.react', { threadId: thread.id, commentId: message.id, emoji });
                            setReaction(null);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            {!thread.deletedAt && (
              <form
                className="comment-reply"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (execute('comment.reply', { threadId: thread.id, text: replies[thread.id] }))
                    setReplies({ ...replies, [thread.id]: '' });
                }}
              >
                <textarea
                  aria-label={`回复 ${thread.messages[0]?.author || '讨论'}`}
                  placeholder="回复…"
                  rows={1}
                  value={replies[thread.id] || ''}
                  onChange={(event) => setReplies({ ...replies, [thread.id]: event.target.value })}
                />
                <button className="text-button" disabled={!replies[thread.id]?.trim()}>
                  {thread.resolvedAt ? '回复并重新打开' : '回复'}
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
      <form
        className="new-comment"
        onSubmit={(event) => {
          event.preventDefault();
          const thread = execute('comment.add', { text: draft, blockId: panel.blockId, quote: panel.quote });
          if (thread) {
            setDraft('');
            setStatus('open');
            setCommentPanel({ pageId: page.id, threadId: thread.id });
          }
        }}
      >
        {panel.quote && (
          <div className="comment-new-quote">
            {panel.quote}
            <IconButton label="取消引用" onClick={() => setCommentPanel({ pageId: page.id })}>
              <X size={12} />
            </IconButton>
          </div>
        )}
        <textarea
          aria-label="新评论"
          placeholder={panel.blockId ? '评论选中的内容…' : '添加页面评论…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="comment-compose-actions">
          <span>{workspace!.settings.authorName || '我'} · 仅本机</span>
          <button className="primary-button" disabled={!draft.trim()}>
            <Send size={13} />
            评论
          </button>
        </div>
      </form>
    </aside>
  );
}
