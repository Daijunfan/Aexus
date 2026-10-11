import type { CommentMessage, CommentThread, Workspace } from '../types.ts';
import { requirePage } from '../core/access.ts';
import { getBlock } from '../core/blocks.ts';
import { CommandError, requiredString } from '../core/errors.ts';
import { plainText } from '../model.ts';
import type { CommandParams } from '../core/protocol.ts';

export function executeCommentCommand(workspace: Workspace, method: string, params: CommandParams) {
  if (!method.startsWith('comment.')) return;
  const reading = method === 'comment.list' || method === 'comment.get';
  const page = requirePage(workspace, params.pageId, reading);
  const threads = page.comments || [];
  const result = (data: any, changed = false) => ({ workspace, result: data, changed });
  const now = Date.now();
  const message = (): CommentMessage => ({
    id: crypto.randomUUID(),
    author: String(params.author || workspace.settings.authorName || '我'),
    text: requiredString(params.text, 'text').trim(),
    createdAt: now,
    updatedAt: now,
  });
  const save = (thread: CommentThread, output: any = thread) => {
    const comments = threads.some((value) => value.id === thread.id)
      ? threads.map((value) => (value.id === thread.id ? thread : value))
      : [...threads, thread];
    workspace = {
      ...workspace,
      pages: workspace.pages.map((value) =>
        value.id === page.id ? { ...page, comments, updatedAt: now } : value,
      ),
    };
    return result(output, true);
  };
  if (method === 'comment.list')
    return result(
      threads
        .filter(
          (thread) =>
            (params.deleted || !thread.deletedAt) &&
            (!params.blockId || thread.blockId === params.blockId) &&
            (!params.status ||
              params.status === 'all' ||
              (params.status === 'resolved' ? !!thread.resolvedAt : !thread.resolvedAt)),
        )
        .map((thread) => ({
          ...thread,
          messages: thread.messages.filter((message) => params.deleted || !message.deletedAt),
        })),
    );
  if (method === 'comment.add') {
    const block = params.blockId ? getBlock(page.blocks, params.blockId) : undefined;
    return save({
      id: crypto.randomUUID(),
      createdAt: now,
      ...(block
        ? { blockId: block.id, quote: params.quote || plainText(block.content).slice(0, 500) }
        : params.quote
          ? { quote: params.quote }
          : {}),
      messages: [message()],
    });
  }
  const thread = threads.find((thread) => thread.id === params.threadId);
  if (!thread) throw new CommandError('THREAD_NOT_FOUND', '未找到评论讨论');
  if (method === 'comment.get') return result(thread);
  if (method === 'comment.restore') {
    if (!params.commentId)
      return save({
        ...thread,
        deletedAt: null,
        messages: thread.messages.every((message) => message.deletedAt)
          ? thread.messages.map((message) => ({ ...message, deletedAt: null }))
          : thread.messages,
      });
    if (!thread.messages.some((message) => message.id === params.commentId))
      throw new CommandError('COMMENT_NOT_FOUND', '未找到评论');
    return save({
      ...thread,
      deletedAt: null,
      messages: thread.messages.map((message) =>
        message.id === params.commentId ? { ...message, deletedAt: null } : message,
      ),
    });
  }
  if (thread.deletedAt) throw new CommandError('THREAD_DELETED', '讨论已删除，请先恢复');
  if (method === 'comment.reply')
    return save({ ...thread, resolvedAt: null, messages: [...thread.messages, message()] });
  if (method === 'comment.resolve') return save({ ...thread, resolvedAt: now });
  if (method === 'comment.reopen') return save({ ...thread, resolvedAt: null });
  if (method === 'comment.delete' && !params.commentId) return save({ ...thread, deletedAt: now });
  const item = thread.messages.find((message) => message.id === params.commentId);
  if (!item) throw new CommandError('COMMENT_NOT_FOUND', '未找到评论');
  if (item.deletedAt) throw new CommandError('COMMENT_DELETED', '评论已删除，请先恢复');
  let next = item;
  if (method === 'comment.update')
    next = { ...item, text: requiredString(params.text, 'text').trim(), updatedAt: now };
  else if (method === 'comment.delete') next = { ...item, deletedAt: now };
  else if (method === 'comment.react') {
    const emoji = requiredString(params.emoji, 'emoji');
    next = {
      ...item,
      reactions: { ...item.reactions, [emoji]: params.remove ? false : !item.reactions?.[emoji] },
    };
  } else throw new CommandError('METHOD_NOT_FOUND', `未知评论方法 ${method}`);
  const messages = thread.messages.map((message) => (message.id === item.id ? next : message));
  return save(
    { ...thread, messages, ...(messages.every((message) => message.deletedAt) ? { deletedAt: now } : {}) },
    next,
  );
}
