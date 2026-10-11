import { requiredPageColor } from './appearance.ts';
import { CommandError, requiredString } from './errors.ts';
import { makePage, descendants } from '../model.ts';
import type { CommandParams } from './protocol.ts';
import type {
  AgentConfig,
  AgentMessage,
  Page,
  Space,
  SpaceEngine,
  SpaceFolder,
  Workspace,
} from '../types.ts';

export const MAX_AGENT_MESSAGES = 50;

export const agentConversationId = (agent: AgentConfig) =>
  agent.conversationId || agent.sessionId || 'default';

/** The active conversation remains the public facade; other conversations retain their own state. */
export function getAgent(workspace: Workspace, pageId: string, conversationId?: string): AgentConfig {
  const agent = spaceMeta(workspace, pageId).agent;
  if (!conversationId || conversationId === agentConversationId(agent) || conversationId === agent.sessionId)
    return agent;
  const session = agent.sessions?.find(
    (item) => (item.conversationId || item.id) === conversationId || item.id === conversationId,
  );
  if (!session) throw new CommandError('SESSION_NOT_FOUND', '会话不属于此空间');
  return (
    session.state || {
      engine: agent.engine,
      conversationId: session.conversationId || session.id,
      sessionId: session.id,
      status: 'idle',
      messages: [],
      options: agent.options,
      queue: session.queue || [],
      queuePaused: !!session.queue?.length,
    }
  );
}

export type SpaceExecution = { workspace: Workspace; result: any } | undefined;

const requireSpace = (workspace: Workspace, pageId: string) => {
  const page = workspace.pages.find((value) => value.id === pageId);
  if (!page || page.trashedAt) throw new CommandError('PAGE_NOT_FOUND', '找不到空间页面');
  if (!page.space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
  return page;
};

const spaceMeta = (workspace: Workspace, pageId: string): Space => {
  const space = workspace.spaces?.[pageId];
  if (!space) throw new CommandError('NOT_A_SPACE', '空间配置缺失');
  return space;
};

const folderOf = (page: Page, folderId: string | null | undefined) => {
  if (folderId === null || folderId === undefined) return null;
  const folder = (page.folders || []).find((value) => value.id === folderId);
  if (!folder) throw new CommandError('FOLDER_NOT_FOUND', '找不到文件夹');
  return folder;
};

const engineOf = (value: unknown): SpaceEngine => {
  if (value === 'claude' || value === 'codex') return value;
  throw new CommandError('INVALID_ENGINE', '引擎必须是 claude 或 codex');
};

const folderSubtree = (folders: SpaceFolder[], id: string) => {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const folder of folders)
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
  }
  return ids;
};

const replacePage = (workspace: Workspace, page: Page): Workspace => ({
  ...workspace,
  pages: workspace.pages.map((value) => (value.id === page.id ? page : value)),
});

export function appendAgentMessages(
  workspace: Workspace,
  pageId: string,
  messages: AgentMessage[],
  status?: AgentConfig['status'],
  conversationId?: string,
): Workspace {
  const space = workspace.spaces?.[pageId];
  if (!space) return workspace;
  const current = getAgent(workspace, pageId, conversationId);
  const merged = [
    ...new Map([...current.messages, ...messages].map((message) => [message.id, message])).values(),
  ];
  const agent: AgentConfig = {
    ...current,
    messages: merged.slice(-MAX_AGENT_MESSAGES),
    ...(status ? { status } : {}),
    ...(status && status !== 'running' ? { endedAt: Date.now() } : {}),
  };
  return setAgentState(workspace, pageId, agent, conversationId);
}

export function setAgentState(
  workspace: Workspace,
  pageId: string,
  changes: Partial<AgentConfig>,
  conversationId?: string,
): Workspace {
  const space = workspace.spaces?.[pageId];
  if (!space) return workspace;
  if (conversationId && conversationId !== agentConversationId(space.agent)) {
    const current = getAgent(workspace, pageId, conversationId);
    return setAgentState(workspace, pageId, {
      sessions: space.agent.sessions?.map((session) =>
        (session.conversationId || session.id) === agentConversationId(current)
          ? {
              ...session,
              id: changes.sessionId || session.id,
              state: { ...current, ...changes },
              ...(changes.messages ? { unread: true } : {}),
            }
          : session,
      ),
    });
  }
  return {
    ...workspace,
    spaces: {
      ...workspace.spaces,
      [pageId]: { ...space, agent: { ...space.agent, ...changes } },
    },
  };
}

export function executeSpaceCommand(
  workspace: Workspace,
  method: string,
  params: CommandParams,
): SpaceExecution {
  if (!method.startsWith('space.') && !method.startsWith('folder.') && !method.startsWith('file.')) return;

  if (method === 'space.list') {
    return {
      workspace,
      result: workspace.pages
        .filter((page) => page.space && !page.trashedAt)
        .map((page) => ({
          id: page.id,
          title: page.title,
          engine: workspace.spaces?.[page.id]?.engine || 'claude',
          folderCount: (page.folders || []).length,
          fileCount: (page.files || []).length,
          agentStatus: workspace.spaces?.[page.id]?.agent.status || 'idle',
        })),
    };
  }
  if (method === 'space.get') {
    const page = requireSpace(workspace, requiredString(params.pageId, 'pageId'));
    return {
      workspace,
      result: {
        page,
        space: spaceMeta(workspace, page.id),
        folders: page.folders || [],
        files: page.files || [],
      },
    };
  }
  if (method === 'space.create') {
    const title = requiredString(params.title, 'title');
    const engine = engineOf(params.engine || 'claude');
    const parentId = params.parentId && params.parentId !== 'root' ? String(params.parentId) : null;
    if (parentId) throw new CommandError('INVALID_SPACE', '空间必须是顶层页面');
    const page = makePage({ title, color: requiredPageColor(params), textColor: params.textColor, parentId: null, space: true, folders: [], files: [] });
    const space: Space = {
      engine,
      title,
      agent: { engine, status: 'idle', messages: [] },
    };
    const next: Workspace = {
      ...workspace,
      pages: [...workspace.pages, page],
      spaces: { ...workspace.spaces, [page.id]: space },
    };
    return { workspace: next, result: { id: page.id, space } };
  }
  if (method === 'space.configure') {
    const page = requireSpace(workspace, requiredString(params.pageId, 'pageId'));
    const space = spaceMeta(workspace, page.id);
    const engine = params.engine === undefined ? space.engine : engineOf(params.engine);
    if (engine !== space.engine)
      throw new CommandError('IMMUTABLE_ENGINE', '空间与 Agent 引擎固定绑定；请创建新空间');
    const title = params.title === undefined ? space.title : String(params.title);
    const next: Workspace = {
      ...replacePage(workspace, { ...page, title, updatedAt: Date.now() }),
      spaces: {
        ...workspace.spaces,
        [page.id]: { ...space, engine, title, agent: { ...space.agent, engine } },
      },
    };
    return { workspace: next, result: { id: page.id, engine, title } };
  }
  if (method === 'space.convert') {
    const page = workspace.pages.find((value) => value.id === params.pageId);
    if (!page || page.trashedAt) throw new CommandError('PAGE_NOT_FOUND', '找不到页面');
    if (page.parentId !== null) throw new CommandError('INVALID_SPACE', '只有顶层页面可以转换为空间');
    if (page.space && workspace.spaces?.[page.id])
      return { workspace, result: { id: page.id, engine: workspace.spaces[page.id].engine, existing: true } };
    const engine = engineOf(params.engine || 'claude');
    const updated: Page = { ...page, space: true, folders: [], files: [], updatedAt: Date.now() };
    const next: Workspace = {
      ...replacePage(workspace, updated),
      spaces: {
        ...workspace.spaces,
        [page.id]: { engine, title: page.title, agent: { engine, status: 'idle', messages: [] } },
      },
    };
    return { workspace: next, result: { id: page.id, engine } };
  }
  if (method.startsWith('folder.')) {
    const page = requireSpace(workspace, requiredString(params.pageId, 'pageId'));
    const folders = page.folders || [];
    if (method === 'folder.list') return { workspace, result: folders };
    if (method === 'folder.create') {
      const name = requiredString(params.name, 'name');
      const parent = params.parentId ? folderOf(page, String(params.parentId)) : null;
      const folder: SpaceFolder = {
        id: crypto.randomUUID(),
        name,
        parentId: parent ? parent.id : null,
      };
      return {
        workspace: replacePage(workspace, { ...page, folders: [...folders, folder], updatedAt: Date.now() }),
        result: folder,
      };
    }
    if (method === 'folder.rename') {
      const folder = folderOf(page, requiredString(params.folderId, 'folderId'))!;
      const name = requiredString(params.name, 'name');
      return {
        workspace: replacePage(workspace, {
          ...page,
          folders: folders.map((value) => (value.id === folder.id ? { ...value, name } : value)),
          updatedAt: Date.now(),
        }),
        result: { id: folder.id, name },
      };
    }
    if (method === 'folder.move') {
      const folder = folderOf(page, requiredString(params.folderId, 'folderId'))!;
      const target = params.parentId ? folderOf(page, String(params.parentId))! : null;
      if (target && folderSubtree(folders, folder.id).has(target.id))
        throw new CommandError('INVALID_SPACE', '不能把文件夹移动到自身内部');
      return {
        workspace: replacePage(workspace, {
          ...page,
          folders: folders.map((value) =>
            value.id === folder.id ? { ...value, parentId: target ? target.id : null } : value,
          ),
          updatedAt: Date.now(),
        }),
        result: { id: folder.id, parentId: target ? target.id : null },
      };
    }
    if (method === 'folder.delete') {
      const folder = folderOf(page, requiredString(params.folderId, 'folderId'))!;
      const ids = folderSubtree(folders, folder.id);
      const files = (page.files || []).filter((file) => file.folderId && ids.has(file.folderId));
      if ((files.length || ids.size > 1) && !params.confirm)
        throw new CommandError('CONFIRMATION_REQUIRED', '文件夹非空，删除需要 confirm=true');
      return {
        workspace: replacePage(workspace, {
          ...page,
          folders: folders.filter((value) => !ids.has(value.id)),
          files: (page.files || []).filter((file) => !file.folderId || !ids.has(file.folderId)),
          removedFileUrls: [...(page.removedFileUrls || []), ...files.map((file) => file.url)],
          removedFolderPaths: [
            ...(page.removedFolderPaths || []),
            ...folders.filter((folder) => ids.has(folder.id)).map((folder) => folder.path || folder.id),
          ],
          updatedAt: Date.now(),
        }),
        result: { deleted: [...ids] },
      };
    }
    throw new CommandError('METHOD_NOT_FOUND', `未知方法 ${method}`);
  }
  if (method.startsWith('file.')) {
    if (!['file.list', 'file.get', 'file.record', 'file.rename', 'file.move', 'file.remove'].includes(method))
      return;
    const page = requireSpace(workspace, requiredString(params.pageId, 'pageId'));
    if (method === 'file.list') return { workspace, result: page.files || [] };
    if (method === 'file.get' || method === 'file.rename') {
      const file = (page.files || []).find((value) => value.id === params.fileId);
      if (!file) throw new CommandError('FILE_NOT_FOUND', '找不到文件');
      if (method === 'file.get') return { workspace, result: file };
      const updated = { ...file, name: requiredString(params.name, 'name') };
      return {
        workspace: replacePage(workspace, {
          ...page,
          files: page.files!.map((value) => (value.id === file.id ? updated : value)),
          updatedAt: Date.now(),
        }),
        result: updated,
      };
    }
    if (method === 'file.record') {
      folderOf(page, params.folderId);
      if (
        String(params.url).startsWith('asset://local/spaces/') &&
        !String(params.url).startsWith(`asset://local/spaces/${page.id}/`)
      )
        throw new CommandError('SPACE_ACCESS_DENIED', '文件不属于此空间');
      const existing = page.files?.find((file) => file.url === params.url);
      if (existing) return { workspace, result: existing };
      const record = {
        id: crypto.randomUUID(),
        name: requiredString(params.name, 'name'),
        url: requiredString(params.url, 'url'),
        bytes: Number(params.bytes) || 0,
        folderId: params.folderId ? String(params.folderId) : null,
        createdAt: Date.now(),
        ...(params.mimeType ? { mimeType: String(params.mimeType) } : {}),
      };
      return {
        workspace: replacePage(workspace, {
          ...page,
          files: [...(page.files || []), record],
          updatedAt: Date.now(),
        }),
        result: record,
      };
    }
    if (method === 'file.move') {
      const file = (page.files || []).find((value) => value.id === params.fileId);
      if (!file) throw new CommandError('FILE_NOT_FOUND', '找不到文件');
      folderOf(page, params.folderId);
      return {
        workspace: replacePage(workspace, {
          ...page,
          files: page.files!.map((value) =>
            value.id === file.id
              ? { ...value, folderId: params.folderId ? String(params.folderId) : null }
              : value,
          ),
          updatedAt: Date.now(),
        }),
        result: { id: file.id, folderId: params.folderId ? String(params.folderId) : null },
      };
    }
    if (method === 'file.remove') {
      const file = (page.files || []).find((value) => value.id === params.fileId);
      if (!file) throw new CommandError('FILE_NOT_FOUND', '找不到文件');
      return {
        workspace: replacePage(workspace, {
          ...page,
          files: page.files!.filter((value) => value.id !== file.id),
          removedFileUrls: [...(page.removedFileUrls || []), file.url],
          updatedAt: Date.now(),
        }),
        result: { deleted: file.id, url: file.url },
      };
    }
    throw new CommandError('METHOD_NOT_FOUND', `未知方法 ${method}`);
  }
  throw new CommandError('METHOD_NOT_FOUND', `未知方法 ${method}`);
}

export function spacePagesRemoved(workspace: Workspace, removed: Set<string>): Workspace {
  if (!workspace.spaces) return workspace;
  const spaces = Object.fromEntries(Object.entries(workspace.spaces).filter(([id]) => !removed.has(id)));
  return { ...workspace, spaces };
}

export { descendants };
