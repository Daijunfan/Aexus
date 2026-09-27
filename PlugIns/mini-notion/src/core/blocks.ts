import type { JsonBlock } from '../types.ts';
import { CommandError } from './errors.ts';

export const blockTypes = [
  'bookmark',
  'breadcrumb',
  'equation',
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'quote',
  'codeBlock',
  'divider',
  'table',
  'image',
  'video',
  'audio',
  'file',
  'callout',
  'pageLink',
  'tableOfContents',
  'columnList',
  'column',
  'databaseView',
  'syncedBlock',
  'button',
] as const;
export const blockFields = {
  equation: { content: 'none', props: { expression: 'LaTeX string', textColor: 'color', backgroundColor: 'color' } },
  bookmark: { content: 'none', props: { url: 'http/https/mininotion URL', title: 'string', description: 'string' } },
  breadcrumb: { content: 'none', description: 'Current page path, derived from the page tree' },
} as const;
export const inlineContentTypes = ['text', 'link', 'pageMention', 'inlineMath'] as const;
export function normalizeBlocks(
  blocks: JsonBlock[],
  freshIds = false,
  seen = new Set<string>(),
): JsonBlock[] {
  if (!Array.isArray(blocks)) throw new CommandError('INVALID_BLOCKS', 'blocks 必须是数组');
  return blocks.map((block) => {
    const id = freshIds || !block.id || seen.has(block.id) ? crypto.randomUUID() : block.id;
    seen.add(id);
    return {
      ...block,
      id,
      ...(block.children ? { children: normalizeBlocks(block.children, freshIds, seen) } : {}),
    };
  });
}

export function validateBlocks(blocks: JsonBlock[], parent?: string, ids = new Set<string>()) {
  if (!Array.isArray(blocks)) throw new CommandError('INVALID_BLOCKS', 'blocks 必须是数组');
  for (const block of blocks) {
    if (!block || !blockTypes.includes(block.type as (typeof blockTypes)[number]))
      throw new CommandError('INVALID_BLOCK_TYPE', `不支持的块类型：${block?.type}`);
    if (!block.id || ids.has(block.id)) throw new CommandError('INVALID_BLOCK_ID', '块 ID 缺失或重复');
    ids.add(block.id);
    if (parent === 'columnList' && block.type !== 'column')
      throw new CommandError('INVALID_COLUMNS', 'columnList 中只能包含 column');
    if (block.type === 'column' && parent !== 'columnList')
      throw new CommandError('INVALID_COLUMNS', 'column 必须位于 columnList 中');
    if (
      block.type === 'table' &&
      block.content !== undefined &&
      (!block.content || !Array.isArray(block.content.rows))
    )
      throw new CommandError('INVALID_TABLE', '表格内容必须包含 rows');
    if (block.type === 'bookmark' && block.props?.url && (typeof block.props.url !== 'string' || !/^(https?:\/\/|mininotion:\/\/page\/)/i.test(block.props.url))) throw new CommandError('INVALID_BOOKMARK', '书签需要网页或本地页面链接');
    if (block.type === 'equation' && block.props?.expression !== undefined && typeof block.props.expression !== 'string') throw new CommandError('INVALID_EQUATION', 'expression 需要 LaTeX 字符串');
    if (block.content !== undefined && block.type !== 'table') validateInline(block.content);
    if (block.type === 'table')
      for (const row of block.content?.rows || []) {
        if (!Array.isArray(row.cells)) throw new CommandError('INVALID_TABLE', '每行必须包含 cells 数组');
        for (const cell of row.cells) validateInline(cell?.type === 'tableCell' ? cell.content : cell);
      }
    if (block.children) validateBlocks(block.children, block.type, ids);
  }
}
function validateInline(content: any) {
  if (typeof content === 'string') return;
  if (!Array.isArray(content)) throw new CommandError('INVALID_CONTENT', '文本内容需要字符串或行内内容数组');
  for (const item of content) {
    if (typeof item === 'string') continue;
    if (item?.type === 'text') {
      if (typeof item.text !== 'string')
        throw new CommandError('INVALID_CONTENT', 'text 节点需要 text 字符串');
      for (const style of Object.keys(item.styles || {}))
        if (
          !['bold', 'italic', 'underline', 'strike', 'code', 'textColor', 'backgroundColor'].includes(style)
        )
          throw new CommandError('INVALID_STYLE', `不支持文本样式 ${style}`);
    } else if (item?.type === 'link') {
      if (typeof item.href !== 'string') throw new CommandError('INVALID_LINK', '链接需要 href');
      validateInline(item.content);
    } else if (item?.type === 'inlineMath') {
      if (typeof item.props?.expression !== 'string') throw new CommandError('INVALID_EQUATION', '行内公式需要 props.expression 字符串');
    } else if (item?.type !== 'pageMention')
      throw new CommandError('INVALID_CONTENT', `不支持行内类型 ${item?.type}`);
  }
}

export function flattenBlocks(
  blocks: JsonBlock[],
  parentId: string | null = null,
): { block: JsonBlock; parentId: string | null; index: number }[] {
  return blocks.flatMap((block, index) => [
    { block, parentId, index },
    ...flattenBlocks(block.children || [], block.id!),
  ]);
}

export function getBlock(blocks: JsonBlock[], id: string): JsonBlock {
  const found = flattenBlocks(blocks).find((item) => item.block.id === id)?.block;
  if (!found) throw new CommandError('BLOCK_NOT_FOUND', `未找到块 ${id}`);
  return found;
}

/** Document-ordered roots of a selection; children of selected parents travel once. */
export function selectedBlocks(blocks: JsonBlock[], ids: string[]): JsonBlock[] {
  if (!Array.isArray(ids) || !ids.length) throw new CommandError('INVALID_ARGUMENT', 'ids 需要非空块 ID 数组');
  ids.forEach(id => getBlock(blocks, id));
  const selected = new Set(ids);
  const visit = (items: JsonBlock[]): JsonBlock[] => items.flatMap(block =>
    selected.has(block.id!) ? [block] : visit(block.children || []));
  return visit(blocks);
}

export function updateBlock(blocks: JsonBlock[], id: string, changes: Partial<JsonBlock>): JsonBlock[] {
  getBlock(blocks, id);
  const update = (items: JsonBlock[]): JsonBlock[] =>
    items.map((block) =>
      block.id === id
        ? { ...block, ...changes, id }
        : block.children
          ? { ...block, children: update(block.children) }
          : block,
    );
  return update(blocks);
}

export function deleteBlocks(blocks: JsonBlock[], ids: string[]): JsonBlock[] {
  const remove = (items: JsonBlock[]): JsonBlock[] =>
    items
      .filter((block) => !ids.includes(block.id!))
      .map((block) => (block.children ? { ...block, children: remove(block.children) } : block));
  return remove(blocks);
}

export function insertBlocks(
  blocks: JsonBlock[],
  inserted: JsonBlock[],
  placement: { parentId?: string | null; beforeId?: string; afterId?: string } = {},
): JsonBlock[] {
  const existing = new Set(flattenBlocks(blocks).map((item) => item.block.id));
  if (flattenBlocks(inserted).some((item) => existing.has(item.block.id)))
    throw new CommandError('DUPLICATE_BLOCK_ID', '插入块的 ID 已存在');
  let parentId = placement.parentId || null;
  const anchorId = placement.beforeId || placement.afterId;
  if (anchorId) {
    const anchor = flattenBlocks(blocks).find((item) => item.block.id === anchorId);
    if (!anchor) throw new CommandError('BLOCK_NOT_FOUND', `未找到位置块 ${anchorId}`);
    parentId = anchor.parentId;
  }
  const add = (items: JsonBlock[]) => {
    const index = anchorId
      ? items.findIndex((block) => block.id === anchorId) + (placement.afterId ? 1 : 0)
      : items.length;
    return [...items.slice(0, index), ...inserted, ...items.slice(index)];
  };
  if (!parentId) return add(blocks);
  const parent = getBlock(blocks, parentId);
  return updateBlock(blocks, parentId, { children: add(parent.children || []) });
}

export function moveBlock(
  blocks: JsonBlock[],
  id: string,
  placement: { parentId?: string | null; beforeId?: string; afterId?: string },
): JsonBlock[] {
  const block = getBlock(blocks, id);
  const ownIds = new Set(flattenBlocks([block]).map((item) => item.block.id));
  if (
    [placement.parentId, placement.beforeId, placement.afterId].some((target) => target && ownIds.has(target))
  )
    throw new CommandError('INVALID_MOVE', '不能把块移动到其自身或子块中');
  return insertBlocks(deleteBlocks(blocks, [id]), [block], placement);
}

export function formatBlock(
  block: JsonBlock,
  styles: Record<string, unknown>,
  from = 0,
  to = Infinity,
): JsonBlock {
  if (
    ![
      'paragraph',
      'heading',
      'bulletListItem',
      'numberedListItem',
      'checkListItem',
      'toggleListItem',
      'quote',
      'callout',
    ].includes(block.type)
  )
    throw new CommandError('INVALID_FORMAT_TARGET', '此块不支持文本格式');
  const content =
    typeof block.content === 'string'
      ? [{ type: 'text', text: block.content, styles: {} }]
      : block.content || [];
  let offset = 0;
  const { link, ...textStyles } = styles;
  const wrap = (item: any, href?: string) => (href ? { type: 'link', href, content: [item] } : item);
  const format = (items: any[], href?: string): any[] =>
    items.flatMap((item) => {
      if (item.type === 'link')
        return format(
          typeof item.content === 'string'
            ? [{ type: 'text', text: item.content, styles: {} }]
            : item.content || [],
          item.href,
        );
      if (item.type !== 'text') {
        offset += 1;
        return [item];
      }
      const text = item.text as string;
      const start = Math.max(0, from - offset),
        end = Math.min(text.length, to - offset);
      offset += text.length;
      if (end <= start) return [wrap(item, href)];
      const combined = { ...item.styles, ...textStyles };
      for (const key of Object.keys(combined))
        if (combined[key] === false || combined[key] === null) delete combined[key];
      const selected = { ...item, text: text.slice(start, end), styles: combined };
      const target = typeof link === 'string' ? link : link === false || link === null ? undefined : href;
      return [
        ...(start ? [wrap({ ...item, text: text.slice(0, start) }, href)] : []),
        wrap(selected, target),
        ...(end < text.length ? [wrap({ ...item, text: text.slice(end) }, href)] : []),
      ];
    });
  const result = format(content);
  return { ...block, content: result };
}
