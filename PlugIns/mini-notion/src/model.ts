import { readProperty } from './database/propertiesModel.ts';
import { copyActions, copyAutomations } from './actions/copy.ts';
import { normalizeBlocks } from './core/blocks.ts';
import type { Page, Workspace, JsonBlock, Property } from './types.ts';
import { sourceClosure } from './content/references.ts';
import { normalizePageColors } from './core/appearance.ts';

export function makePage(overrides: Partial<Page> = {}): Page {
  const now = Date.now();
  return normalizePageColors({
    id: crypto.randomUUID(),
    parentId: null,
    title: '',
    icon: '',
    cover: null,
    coverPosition: 50,
    favorite: false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    fullWidth: false,
    smallText: false,
    font: 'default' as const,
    locked: false,
    values: {},
    ...overrides,
    blocks: normalizeBlocks(overrides.blocks || [{ type: 'paragraph', content: '' }]),
  });
}

export function descendants(pages: Page[], id: string): Set<string> {
  const found = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const page of pages)
      if (
        ((page.parentId && found.has(page.parentId)) || (page.subItemOf && found.has(page.subItemOf))) &&
        !found.has(page.id)
      ) {
        found.add(page.id);
        changed = true;
      }
  }
  return found;
}

export function ancestors(pages: Page[], id: string): Page[] {
  const result: Page[] = [];
  const seen = new Set([id]);
  const first = pages.find((p) => p.id === id);
  let parentId = first?.subItemOf || first?.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = pages.find((p) => p.id === parentId);
    if (!parent) break;
    result.unshift(parent);
    parentId = parent.subItemOf || parent.parentId;
  }
  return result;
}

export function isTemplatePage(page: Page, pages: Page[]): boolean {
  return !!page.templateFor || ancestors(pages, page.id).some((parent) => parent.templateFor);
}
export function isInternalPage(page: Page, pages: Page[]): boolean {
  return !!page.syncedSource || isTemplatePage(page, pages);
}

export function movePage(
  workspace: Workspace,
  id: string,
  parentId: string | null,
  beforeId?: string,
): Workspace {
  if (parentId && descendants(workspace.pages, id).has(parentId)) return workspace;
  if (parentId && !workspace.pages.some((p) => p.id === parentId && !p.trashedAt)) return workspace;
  const page = workspace.pages.find((p) => p.id === id);
  if (!page || beforeId === id) return workspace;
  const targetIsDatabase = !!workspace.pages.find((value) => value.id === parentId)?.database;
  const subtree = descendants(workspace.pages, id);
  const movedRecords = new Set([
    id,
    ...workspace.pages
      .filter((value) => subtree.has(value.id) && value.subItemOf && value.parentId === page.parentId)
      .map((value) => value.id),
  ]);
  const relocate = (value: Page): Page => {
    if (page.parentId === parentId) return value;
    if (movedRecords.has(value.id))
      return {
        ...value,
        parentId: value.id === id ? parentId : targetIsDatabase ? parentId : value.subItemOf || id,
        ...(value.subItemOf
          ? { subItemOf: value.id !== id && targetIsDatabase ? value.subItemOf : null }
          : {}),
        ...(value.blockedBy
          ? {
              blockedBy: targetIsDatabase
                ? value.blockedBy.filter((dependency) => movedRecords.has(dependency))
                : [],
            }
          : {}),
      };
    if (value.blockedBy?.some((dependency) => movedRecords.has(dependency)))
      return { ...value, blockedBy: value.blockedBy.filter((dependency) => !movedRecords.has(dependency)) };
    return value;
  };
  const pages = workspace.pages.filter((p) => p.id !== id).map(relocate);
  const moved = { ...relocate(page), parentId, updatedAt: Date.now() };
  const position = beforeId ? pages.findIndex((p) => p.id === beforeId) : -1;
  if (position < 0) pages.push(moved);
  else pages.splice(position, 0, moved);
  return {
    ...workspace,
    pages,
    expanded: parentId ? [...new Set([...workspace.expanded, parentId])] : workspace.expanded,
  };
}

export function trashPage(workspace: Workspace, id: string): Workspace {
  const ids = descendants(workspace.pages, id);
  const now = Date.now();
  return {
    ...workspace,
    pages: workspace.pages.map((p) => (ids.has(p.id) && !p.trashedAt ? { ...p, trashedAt: now } : p)),
    activePageId: workspace.activePageId && ids.has(workspace.activePageId) ? null : workspace.activePageId,
  };
}

export function restorePage(workspace: Workspace, id: string): Workspace {
  const page = workspace.pages.find((p) => p.id === id);
  if (!page) return workspace;
  const ids = descendants(workspace.pages, id);
  const parent = workspace.pages.find((p) => p.id === (page.subItemOf || page.parentId));
  return {
    ...workspace,
    pages: workspace.pages.map((p) => {
      if (!ids.has(p.id) || p.trashedAt !== page.trashedAt) return p;
      return {
        ...p,
        trashedAt: null,
        parentId: p.id === id && parent?.trashedAt && !p.subItemOf ? null : p.parentId,
        ...(p.id === id && parent?.trashedAt && p.subItemOf ? { subItemOf: null } : {}),
      };
    }),
  };
}

export function duplicatePage(
  workspace: Workspace,
  id: string,
  rootId?: string,
  options: { comments?: boolean; syncedSources?: boolean } = {},
): { workspace: Workspace; id: string } {
  const ids = descendants(workspace.pages, id);
  if (options.syncedSources)
    for (const page of workspace.pages.filter((page) => ids.has(page.id)))
      for (const source of sourceClosure(workspace.pages, page.blocks)) ids.add(source);
  const originals = workspace.pages.filter((p) => ids.has(p.id) && !p.trashedAt);
  const mapping = new Map(originals.map((p) => [p.id, p.id === id && rootId ? rootId : crypto.randomUUID()]));
  const copies = originals.map((page) => {
    const copy = structuredClone(page);
    copy.id = mapping.get(page.id)!;
    if (copy.repeat) copy.repeat = { ...copy.repeat, id: crypto.randomUUID(), enabled: false };
    if (copy.reminders)
      copy.reminders = copy.reminders.map((reminder) => ({ ...reminder, id: crypto.randomUUID() }));
    delete copy.automationOrigin;
    copy.parentId = mapping.get(page.parentId!) || page.parentId;
    if (copy.templateFor) copy.templateFor = mapping.get(copy.templateFor) || copy.templateFor;
    if (copy.subItemOf) copy.subItemOf = mapping.get(copy.subItemOf) || copy.subItemOf;
    if (copy.blockedBy) copy.blockedBy = copy.blockedBy.map((id) => mapping.get(id) || id);
    if (copy.database) {
      if (copy.database.defaultTemplateId)
        copy.database.defaultTemplateId =
          mapping.get(copy.database.defaultTemplateId) || copy.database.defaultTemplateId;
      for (const view of copy.database.views || []) {
        if (view.defaultTemplateId)
          view.defaultTemplateId = mapping.get(view.defaultTemplateId) || view.defaultTemplateId;
        if (view.collapsedItems) view.collapsedItems = view.collapsedItems.map((id) => mapping.get(id) || id);
      }
    }
    copy.favorite = false;
    copy.createdAt = copy.updatedAt = Date.now();
    const blockMapping = new Map<string, string>();
    if (page.id === id) copy.title = `${page.title || '无标题'}（副本）`;
    if (copy.database)
      for (const column of copy.database.columns)
        if (column.relationTo && mapping.has(column.relationTo))
          column.relationTo = mapping.get(column.relationTo);
    const columns = workspace.pages.find((p) => p.id === page.parentId)?.database?.columns || [];
    for (const column of columns)
      if (column.type === 'relation' && Array.isArray(copy.values[column.id]))
        copy.values[column.id] = (copy.values[column.id] as string[]).map((id) => mapping.get(id) || id);
    const rewriteContent = (value: any) => {
      if (Array.isArray(value)) value.forEach(rewriteContent);
      else if (value && typeof value === 'object') {
        if (value.type === 'pageMention' && mapping.has(value.props?.pageId))
          value.props.pageId = mapping.get(value.props.pageId);
        if (value.type === 'link' && value.href?.startsWith('mininotion://page/')) {
          const oldId = value.href.slice('mininotion://page/'.length);
          if (mapping.has(oldId)) value.href = `mininotion://page/${mapping.get(oldId)}`;
        }
        for (const child of Object.values(value)) if (typeof child === 'object') rewriteContent(child);
      }
    };
    const rewrite = (blocks: JsonBlock[], track = true) =>
      blocks.forEach((block) => {
        const id = crypto.randomUUID();
        if (track && block.id) blockMapping.set(block.id, id);
        block.id = id;
        if (block.type === 'pageLink' && mapping.has(String(block.props?.pageId)))
          block.props!.pageId = mapping.get(String(block.props!.pageId));
        if (block.type === 'databaseView' && mapping.has(String(block.props?.databaseId)))
          block.props!.databaseId = mapping.get(String(block.props!.databaseId));
        if (block.type === 'syncedBlock' && mapping.has(String(block.props?.sourceId)))
          block.props!.sourceId = mapping.get(String(block.props!.sourceId));
        if (block.type === 'button' && block.props?.actions) {
          const config = copyActions(
            { actions: JSON.parse(String(block.props.actions)) },
            workspace.pages,
            mapping,
            page.parentId || undefined,
            (blocks) => rewrite(blocks, false),
          );
          block.props.actions = JSON.stringify(config.actions);
        }
        rewriteContent(block.content);
        if (block.children) rewrite(block.children, track);
      });
    rewrite(copy.blocks);
    if (copy.database) {
      for (const column of copy.database.columns)
        if (column.button)
          column.button = copyActions(column.button, workspace.pages, mapping, page.id, (blocks) =>
            rewrite(blocks, false),
          );
      if (copy.database.automations)
        copy.database.automations = copyAutomations(
          copy.database.automations,
          workspace.pages,
          mapping,
          page.id,
          (blocks) => rewrite(blocks, false),
        );
    }
    if (copy.comments)
      copy.comments = options.comments
        ? copy.comments.map((thread) => ({
            ...thread,
            id: crypto.randomUUID(),
            blockId: thread.blockId ? blockMapping.get(thread.blockId) || thread.blockId : undefined,
            messages: thread.messages.map((message) => ({ ...message, id: crypto.randomUUID() })),
          }))
        : [];
    return copy;
  });
  return { workspace: { ...workspace, pages: [...workspace.pages, ...copies] }, id: mapping.get(id)! };
}

export function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const inline = value.every(
      (item) => typeof item === 'string' || (item && ['text', 'link', 'pageMention', 'inlineMath'].includes(item.type)),
    );
    return value.map(plainText).join(inline ? '' : ' ');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.type === 'bookmark') return [obj.props && (obj.props as Record<string, unknown>).title, obj.props && (obj.props as Record<string, unknown>).description, obj.props && (obj.props as Record<string, unknown>).url].filter(Boolean).join(' ');
    if (obj.type === 'equation' || obj.type === 'inlineMath') return String((obj.props as Record<string, unknown>)?.expression || '');
    if (obj.type === 'pageMention') return String((obj.props as Record<string, unknown>)?.title || '');
    return [obj.text, obj.content, obj.children, obj.rows, obj.cells]
      .filter((v) => v !== undefined)
      .map(plainText)
      .join(' ');
  }
  return '';
}

export { searchPages } from './core/search.ts';

export function defaultDatabase(): NonNullable<Page['database']> {
  const id = crypto.randomUUID();
  return {
    columns: [
      {
        id: 'status',
        name: '状态',
        type: 'status',
        options: ['未开始', '进行中', '已完成'],
        statusGroups: { todo: ['未开始'], doing: ['进行中'], done: ['已完成'] },
        defaultStatus: '未开始',
      },
      { id: 'priority', name: '优先级', type: 'select', options: ['高', '中', '低'] },
      { id: 'date', name: '日期', type: 'date' },
      { id: 'tags', name: '标签', type: 'multiSelect', options: ['工作', '生活', '灵感'] },
    ],
    view: 'table',
    views: [{ id, name: '表格', type: 'table', sorts: [], openPagesIn: 'side' }],
    activeViewId: id,
    groupBy: 'status',
  };
}

export { readProperty } from './database/propertiesModel.ts';
