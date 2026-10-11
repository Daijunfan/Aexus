import { pageReference } from './core/links';
import { normalizeWorkspace } from './core/normalize';
import packageInfo from '../package.json';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Page, Workspace } from './types';
import { createWorkspace } from './seed';
import { WorkspaceSync } from './core/sync';
import { DraftCheckpoint } from './core/draftCheckpoint';
import type { WorkspacePatch } from './core/patch';
import { executeWorkspaceCommand } from './core/commands';
import { agentConversationId } from './core/spaces';
import { finalizeProperties } from './database/propertyData';
import { createTemplateRecord } from './database/templatesModel';
import { applySystemValues } from './database/relations';
import { validateSyncedSources } from './content/references';
import { ancestors, descendants, duplicatePage, makePage, movePage, restorePage, trashPage } from './model';

export type ModalState = {
  type:
    | 'button'
    | 'automations'
    | 'action-history'
    | 'inbox'
    | 'scheduler'
    | 'repeat'
    | 'reminder'
    | 'search'
    | 'settings'
    | 'appearance'
    | 'templates'
    | 'trash'
    | 'help'
    | 'import'
    | 'export'
    | 'move'
    | 'history'
    | 'conflicts'
    | 'operations'
    | 'space-create';
  pageId?: string;
  blockId?: string;
  propertyId?: string;
  ownerId?: string;
  query?: string;
  tab?: string;
} | null;
function useStore() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const current = useRef<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [appVersion, setAppVersion] = useState(packageInfo.version);
  const [dataPath, setDataPath] = useState('浏览器本地存储');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [commentPanel, setCommentPanel] = useState<{
    pageId: string;
    blockId?: string;
    quote?: string;
    threadId?: string;
  } | null>(null);
  const [pageMenu, setPageMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [spacePanel, setSpacePanel] = useState<{ pageId: string; fileId?: string; line?: number } | null>(
    null,
  );
  const [agentPanel, setAgentPanel] = useState<{
    pageId: string;
    tab?: string;
    text?: string;
    context?: import('./types').AgentContext;
  } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ pageId: string; blockId: string; request: number } | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peekMode, setPeekMode] = useState<'side' | 'center'>('side');
  const [navigation, setNavigation] = useState({ items: [null] as (string | null)[], index: 0 });
  const [agentEvents, setAgentEvents] = useState<{ pageId: string; event: any; seq: number }[]>([]);
  const revision = useRef(0);
  const sync = useRef<WorkspaceSync | null>(null);
  const checkpoint = useRef<DraftCheckpoint | null>(null);
  const [conflictId, setConflictId] = useState<string>();
  const notify = useCallback((message: string, undo?: () => void) => setToast({ message, undo }), []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const persist = useCallback((next: Workspace) => {
    const id = ++revision.current;
    setSaving(true);
    const operation = window.native
      ? window.native.save(next)
      : Promise.resolve().then(() => {
          localStorage.setItem('mini-notion-workspace', JSON.stringify(next));
          return Date.now();
        });
    operation
      .then(() => {
        if (id === revision.current) {
          setSaving(false);
          setSaveError('');
        }
      })
      .catch((error) => {
        if (id === revision.current) {
          setSaving(false);
          setSaveError(String(error.message || error));
        }
      });
    return operation;
  }, []);

  const update = useCallback(
    (transform: (state: Workspace) => Workspace) => {
      if (!current.current) return;
      const candidate = transform(current.current);
      if (candidate === current.current) return;
      const next = finalizeProperties(current.current, candidate, 'gui');
      validateSyncedSources(next);
      if (next === current.current) return;
      current.current = next;
      setWorkspace(next);
      if (sync.current) sync.current.update(next);
      else void persist(next).catch(() => {});
    },
    [persist],
  );

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const result = window.native
        ? await window.native.load()
        : {
            workspace: JSON.parse(
              localStorage.getItem('mini-notion-workspace') || 'null',
            ) as Workspace | null,
            dataPath: '浏览器本地存储',
          };
      let next = normalizeWorkspace(result.workspace || createWorkspace(), true);
      if (window.native) {
        if (!result.workspace) {
          const initialized = await window.native.api('workspace.init');
          if (initialized.error && initialized.error.code !== 'ALREADY_INITIALIZED')
            throw new Error(initialized.error.message);
          next = initialized.workspace || (await window.native.load()).workspace!;
        }
        const engine = new WorkspaceSync(next, window.native.api, { debounceMs: 120 });
        sync.current = engine;
        checkpoint.current = window.native.saveDraft ? new DraftCheckpoint(value => window.native!.saveDraft!(value), error => setSaveError(String(error))) : null;
        engine.subscribe((state) => {
          current.current = state.workspace;
          setWorkspace(state.workspace);
          setSaving(state.saving);
          setSaveError(state.error);
          setConflictId(state.conflictId);
          try {
            if(checkpoint.current){checkpoint.current.update({patches:state.pending,conflictId:state.conflictId,error:state.error});return}
            if (state.pending.length)
              localStorage.setItem(
                'mini-notion-pending',
                JSON.stringify({ patches: state.pending, conflictId: state.conflictId, error: state.error }),
              );
            else localStorage.removeItem('mini-notion-pending');
          } catch {
            setSaveError('无法保留待保存草稿，请保持应用打开并重试保存');
          }
        });
        const saved = window.native?.loadDraft ? await window.native.loadDraft() : JSON.parse(localStorage.getItem('mini-notion-pending') || '[]');
        const pending = (Array.isArray(saved) ? saved : saved.patches) as WorkspacePatch[];
        if (pending.length) {
          engine.recover(
            pending,
            saved.conflictId
              ? { id: saved.conflictId, message: saved.error || '有待处理的并发草稿' }
              : undefined,
          );
          if (saved.conflictId) {
            const response = await window.native.api('conflict.get', { id: saved.conflictId });
            if (response.result?.resolvedAt)
              engine.receive({
                type: 'state',
                workspace: engine.confirmed,
                revision: engine.confirmed.revision || 0,
                resolution: {
                  id: saved.conflictId,
                  patchId: response.result.patch.id,
                  strategy: response.result.strategy,
                },
              });
          }
        }
        next = engine.workspace;
      }
      current.current = next;
      setWorkspace(next);
      setDataPath(result.dataPath);
      setAppVersion('version' in result ? (result.version as string) : packageInfo.version);
      setNavigation({ items: [next.activePageId], index: 0 });
      if (!window.native && !result.workspace) await persist(next);
      await window.native?.rendererReady?.();
    } catch (error) {
      setLoadError(String(error));
    }
  }, [persist]);
  useEffect(() => {
    const unsubscribe = window.native?.onState((event) => sync.current?.receive(event));
    const stopFlush = window.native?.onFlush(async () => {
      const engine = sync.current;
      if (checkpoint.current && engine) {
        // First make pending edits recoverable, then wait briefly for the main
        // commit. A retained conflict/draft is recovered on the next open.
        checkpoint.current.update({patches:engine.pending,conflictId:engine.conflictId,error:engine.error});
        await checkpoint.current.flush();
        let timer:ReturnType<typeof setTimeout>|undefined;
        try { await Promise.race([engine.flush(),new Promise<void>(resolve=>{timer=setTimeout(resolve,2000)})]); }
        finally { clearTimeout(timer); }
        checkpoint.current.update({patches:engine.pending,conflictId:engine.conflictId,error:engine.error});
        await checkpoint.current.flush();
        return;
      }
      await engine?.flush();
      if (engine?.error) {
        // Standalone notes can close offline once the latest draft is durable.
        try {
          localStorage.setItem('mini-notion-pending', JSON.stringify({
            patches: engine.pending, conflictId: engine.conflictId, error: engine.error,
          }));
        } catch (error) {
          // DOMException properties are lost across Electron's context bridge.
          throw new Error(`无法保存本地草稿：${(error as Error).message || String(error)}`);
        }
      }
    });
    void load();
    return () => {
      unsubscribe?.();
      stopFlush?.();
    };
  }, [load]);
  useEffect(() => {
    const off = window.native?.onAgent?.((event) =>
      setAgentEvents((previous) => [...previous.slice(-200), { ...event, seq: Date.now() + Math.random() }]),
    );
    return () => off?.();
  }, []);

  const navigate = useCallback(
    (id: string | null, blockId?: string, tab?: number | 'new') => {
      if (id) { const reference = pageReference(id); id = reference.pageId; blockId ||= reference.blockId; }
      const state = current.current;
      if (!state || (id && !state.pages.some((p) => p.id === id && !p.trashedAt))) return;
      let tabs = state.settings.pageTabs;
      let activeTab = Math.min(state.settings.activeTab || 0, (tabs?.length || 1) - 1);
      if (tab === 'new') {
        tabs = tabs || [state.activePageId];
        const existing = id ? tabs.indexOf(id) : -1;
        activeTab = existing >= 0 ? existing : tabs.length;
        if (existing < 0) tabs = [...tabs, id];
      } else if (typeof tab === 'number') activeTab = tab;
      else if (tabs) tabs = tabs.map((value, index) => index === activeTab ? id : value);
      setBlockTarget(id && blockId ? { pageId: id, blockId, request: Date.now() } : null);
      setModal(null);
      setPageMenu(null);
      setCommentPanel(null);
      setPeekId(null);
      setNavigation((nav) =>
        nav.items[nav.index] === id
          ? nav
          : { items: [...nav.items.slice(0, nav.index + 1), id], index: nav.index + 1 },
      );
      update((s) => ({
        ...s,
        activePageId: id,
        ...(tabs ? { settings: { ...s.settings, pageTabs: tabs, activeTab } } : {}),
        recent: id ? [id, ...s.recent.filter((p) => p !== id)].slice(0, 20) : s.recent,
        expanded: id ? [...new Set([...s.expanded, ...ancestors(s.pages, id).map((p) => p.id)])] : s.expanded,
      }));
    },
    [update],
  );

  const closeTab = (index: number) => {
    const state = current.current; if (!state?.settings.pageTabs) return;
    const tabs = state.settings.pageTabs.filter((_, i) => i !== index);
    const previous = state.settings.activeTab || 0;
    const activeTab = Math.max(0, Math.min(previous > index ? previous - 1 : previous, tabs.length - 1));
    const id = tabs[activeTab] || null;
    update(s => ({ ...s, settings: { ...s.settings, pageTabs: tabs.length ? tabs : [null], activeTab }, activePageId: id && s.pages.some(page => page.id === id && !page.trashedAt) ? id : null }));
    setBlockTarget(null); setModal(null); setPeekId(null);
  };

  const go = (direction: number) => {
    const index = navigation.index + direction;
    if (index < 0 || index >= navigation.items.length) return;
    const id = navigation.items[index];
    setNavigation({ ...navigation, index });
    update((s) => ({ ...s, activePageId: s.pages.some((p) => p.id === id && !p.trashedAt) ? id : null, ...(s.settings.pageTabs ? { settings: { ...s.settings, pageTabs: s.settings.pageTabs.map((value, position) => position === (s.settings.activeTab || 0) ? id : value) } } : {}) }));
    setModal(null);
    setPeekId(null);
  };

  const patch = useCallback(
    (id: string, changes: Partial<Page>) => {
      try {
        update((state) => {
          const next = {
            ...state,
            pages: state.pages.map((page) =>
              page.id === id ? { ...page, ...changes, updatedAt: Date.now() } : page,
            ),
          };
          return changes.values ? applySystemValues(next, id, changes.values) : next;
        });
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [update, notify],
  );
  const create = useCallback(
    (overrides: Partial<Page> = {}, open = true, templateId?: string | null, viewId?: string) => {
      const state = current.current!;
      const parent = state.pages.find((page) => page.id === overrides.parentId);
      let page: Page;
      let next: Workspace;
      if (parent?.database && !overrides.database && !overrides.templateFor) {
        const created = createTemplateRecord(state, parent.id, overrides, templateId, viewId);
        page = created.page;
        next = created.workspace;
      } else {
        page = makePage(overrides);
        next = { ...state, pages: [...state.pages, page] };
      }
      update(() => ({
        ...next,
        expanded: page.parentId ? [...new Set([...next.expanded, page.parentId])] : next.expanded,
      }));
      if (open) navigate(page.id);
      return page;
    },
    [update, navigate],
  );
  const command = useCallback(
    (method: string, params: Record<string, any> = {}) => {
      const operation = executeWorkspaceCommand(current.current, method, params, { folderMode: !!window.native?.folderMode });
      if (operation.changed && operation.workspace) update(() => operation.workspace!);
      return operation.result;
    },
    [update],
  );

  const trash = useCallback(
    (id: string) => {
      update((s) =>
        s.pages.find((page) => page.id === id)?.templateFor
          ? executeWorkspaceCommand(s, 'template.delete', { templateId: id }).workspace!
          : trashPage(s, id),
      );
      setPageMenu(null);
      setPeekId(null);
      notify('页面已移到回收站', () => update((s) => restorePage(s, id)));
    },
    [update, notify],
  );
  const restore = (id: string) => {
    update((s) => restorePage(s, id));
    notify('页面已恢复');
  };
  const removePermanently = (id: string) => command('page.purge', { pageId: id, confirm: true });
  const duplicate = useCallback(
    (id: string) => {
      if (!current.current) return;
      const result = duplicatePage(current.current, id);
      update(() => result.workspace);
      navigate(result.id);
      notify('已创建页面副本');
    },
    [navigate, notify, update],
  );
  const move = (id: string, parentId: string | null, beforeId?: string) =>
    command('page.move', { pageId: id, parentId, beforeId });
  const toggleExpanded = (id: string) =>
    update((s) => ({
      ...s,
      expanded: s.expanded.includes(id) ? s.expanded.filter((p) => p !== id) : [...s.expanded, id],
    }));
  const setting = useCallback(
    (changes: Partial<Workspace['settings']>) =>
      update((s) => ({ ...s, settings: { ...s.settings, ...changes } })),
    [update],
  );
  const retrySave = async () => {
    if (!current.current) return false;
    if (sync.current) {
      await sync.current.flush();
      return sync.current.retry();
    }
    try {
      await persist(current.current);
      return true;
    } catch {
      return false;
    }
  };

  return {
    blockTarget,
    setBlockTarget,
    getCurrentPage: (id: string) => current.current?.pages.find((page) => page.id === id),
    api: async (method: string, params: Record<string, any> = {}) => {
      if (!window.native) return command(method, params);
      const agent = current.current?.spaces?.[params.pageId]?.agent;
      if (method.startsWith('agent.') && agent && params.conversationId === undefined)
        params = { ...params, conversationId: agentConversationId(agent) };
      if (
        ['agent.start', 'agent.send', 'agent.steer', 'agent.command'].includes(method) ||
        (method === 'agent.queue' && params.action === 'run')
      ) {
        await sync.current?.flush();
        if (sync.current?.error) throw new Error(`页面更改尚未保存：${sync.current.error}`);
      }
      const response = await window.native!.api(method, params);
      if (response.workspace)
        sync.current?.receive({ type: 'state', workspace: response.workspace, revision: response.revision });
      if (response.error) throw new Error(response.error.message);
      return response.result;
    },
    workspace,
    command,
    update,
    patch,
    create,
    navigate,
    closeTab,
    go,
    navigation,
    trash,
    restore,
    removePermanently,
    duplicate,
    move,
    toggleExpanded,
    setting,
    load,
    loadError,
    dataPath,
    appVersion,
    saving,
    saveError,
    retrySave,
    conflictId,
    resolveConflict: (strategy: 'local' | 'remote') => sync.current?.resolve(strategy),
    modal,
    setModal,
    toast,
    notify,
    commentPanel,
    setCommentPanel,
    pageMenu,
    setPageMenu,
    peekId,
    setPeekId,
    peekMode,
    setPeekMode,
    spacePanel,
    setSpacePanel,
    agentPanel,
    setAgentPanel,
    agentEvents,
  };
}

const StoreContext = createContext<ReturnType<typeof useStore> | null>(null);
export const WorkspaceProvider = ({ children }: { children: ReactNode }) => (
  <StoreContext.Provider value={useStore()}>{children}</StoreContext.Provider>
);
export function useWorkspace() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('WorkspaceProvider is missing');
  return context;
}
