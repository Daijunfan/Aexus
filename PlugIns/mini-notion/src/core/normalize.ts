import type { AgentMessage, Space, SpaceFileRecord, SpaceFolder, Workspace, Page } from '../types.ts';
import { activeView, getViews } from '../database/model.ts';
import { normalizeBlocks } from './blocks.ts';
import { finalizeProperties } from '../database/propertyData.ts';
import { normalizePageColors } from './appearance.ts';

const MAX_AGENT_MESSAGES = 50;

function validFolders(folders: unknown): SpaceFolder[] {
  if (!Array.isArray(folders)) return [];
  const ids = new Set<string>();
  const result: SpaceFolder[] = [];
  for (const folder of folders) {
    if (!folder || typeof folder !== 'object') continue;
    const { id, name, parentId } = folder as SpaceFolder;
    if (typeof id !== 'string' || !id || ids.has(id)) continue;
    if (typeof name !== 'string' || !name) continue;
    if (parentId !== null && parentId !== undefined && typeof parentId !== 'string') continue;
    ids.add(id);
    result.push({ id, name, parentId: parentId ?? null, ...(folder.path ? { path: folder.path } : {}) });
  }
  const byId = new Map(result.map((folder) => [folder.id, folder]));
  for (const folder of result) {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      if (seen.has(parentId) || !byId.has(parentId)) {
        folder.parentId = null;
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)!.parentId;
    }
  }
  return result;
}

function validFiles(files: unknown, folders: SpaceFolder[]): SpaceFileRecord[] {
  if (!Array.isArray(files)) return [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const ids = new Set<string>();
  const result: SpaceFileRecord[] = [];
  for (const file of files) {
    if (!file || typeof file !== 'object') continue;
    const entry = file as SpaceFileRecord;
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) continue;
    if (typeof entry.name !== 'string' || !entry.name || typeof entry.url !== 'string') continue;
    ids.add(entry.id);
    result.push({
      id: entry.id,
      name: entry.name,
      url: entry.url,
      bytes: Number(entry.bytes) || 0,
      createdAt: Number(entry.createdAt) || 0,
      ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
      folderId: entry.folderId && folderIds.has(entry.folderId) ? entry.folderId : null,
      ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    });
  }
  return result;
}

function validAgent(value: unknown, engine: Space['engine']): Space['agent'] {
  const agent = (value && typeof value === 'object' ? value : {}) as Space['agent'];
  const messages = (Array.isArray(agent.messages) ? agent.messages : []).filter(
    (message): message is AgentMessage =>
      !!message &&
      typeof message === 'object' &&
      typeof message.id === 'string' &&
      ['user', 'agent', 'system'].includes(message.role) &&
      ['text', 'activity'].includes(message.kind),
  );
  return {
    engine,
    conversationId: agent.conversationId || agent.sessionId || 'default',
    status: agent.status ?? 'idle',
    messages: messages.slice(-MAX_AGENT_MESSAGES),
    ...(agent.error ? { error: agent.error } : {}),
    ...(agent.sessionId ? { sessionId: agent.sessionId } : {}),
    ...(agent.startedAt ? { startedAt: agent.startedAt } : {}),
    ...(agent.endedAt ? { endedAt: agent.endedAt } : {}),
    ...(agent.usage ? { usage: agent.usage } : {}),
    ...(agent.options ? { options: agent.options } : {}),
    ...(agent.sessions ? { sessions: agent.sessions } : {}),
    ...(agent.capabilities ? { capabilities: agent.capabilities } : {}),
    ...(agent.conversationVersion ? { conversationVersion: agent.conversationVersion } : {}),
    ...(agent.forkSession ? { forkSession: true } : {}),
    ...(agent.queue ? { queue: agent.queue } : {}),
    ...(agent.queuePaused ? { queuePaused: true } : {}),
  };
}

/** Every user-facing top-level page owns one physical Workspace, including databases. */
export function isSpaceRoot(page: Page): boolean {
  return page.parentId === null && !page.syncedSource && !page.templateFor;
}

export function normalizeWorkspace(workspace: Workspace, migrateLegacyViews = false): Workspace {
  const spaces: Record<string, Space> = { ...(workspace.spaces || {}) };
  const pages: Page[] = workspace.pages.map((page) => {
    if (!isSpaceRoot(page)) {
      const { space: _space, folders: _folders, files: _files, ...rest } = page;
      return rest;
    }
    const folders = validFolders(page.folders);
    const files = validFiles(page.files, folders);
    const previous = spaces[page.id];
    const engine = previous?.engine === 'codex' ? 'codex' : 'claude';
    spaces[page.id] = {
      engine,
      title: page.title,
      agent: validAgent(previous?.agent, engine),
    };
    return { ...page, space: true, folders, files };
  });
  for (const id of Object.keys(spaces))
    if (!pages.some((page) => page.id === id && page.space)) delete spaces[id];
  return finalizeProperties(
    null,
    {
      ...workspace,
      revision: workspace.revision || 0,
      spaces,
      pages: pages.map((page) => ({
        ...normalizePageColors(page),
        blocks: normalizeBlocks(page.blocks),
        ...(page.database
          ? {
              database: {
                ...page.database,
                // Older CLI versions accepted pie even though the renderer uses donut.
                // Migrate stored data only; new API writes still reject unsupported values.
                views: getViews(page.database).map((view) =>
                  migrateLegacyViews && (view.chartType as string) === 'pie'
                    ? { ...view, chartType: 'donut' as const }
                    : view,
                ),
                activeViewId: activeView(page.database).id,
              },
            }
          : {}),
      })),
    },
    'normalize',
  );
}
