import type { JsonBlock } from '../types.ts';
import { normalizeCodeLanguage } from './codeLanguages';
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
const textFields = { content: 'UTF-8 string or inline array [{type:"text",text:"...",styles:{bold:true}}]', children: 'optional nested block array', props: { textColor: 'default/gray/brown/orange/yellow/green/blue/purple/pink/red', backgroundColor: 'same colors' } };
export const blockFields = {
  paragraph: { ...textFields, example: { type: 'paragraph', content: '正文；可直接用字符串' } },
  heading: { ...textFields, props: { ...textFields.props, level: '1 | 2 | 3' }, example: { type: 'heading', props: { level: 2 }, content: '技术实现' } },
  bulletListItem: { ...textFields, example: { type: 'bulletListItem', content: '实现细节' } },
  numberedListItem: { ...textFields, example: { type: 'numberedListItem', content: '第一步' } },
  checkListItem: { ...textFields, props: { ...textFields.props, checked: 'boolean' }, example: { type: 'checkListItem', props: { checked: false }, content: '回读验收' } },
  toggleListItem: { ...textFields, example: { type: 'toggleListItem', content: '展开细节', children: [{ type: 'paragraph', content: '递归块内容' }] } },
  quote: { ...textFields, example: { type: 'quote', content: '注明源码路径和行号' } },
  codeBlock: { ...textFields, props: { language: 'text/javascript/typescript/python/json/html/css/shellscript/sql/swift/rust/go/yaml/markdown; js/ts/py/bash 等别名自动规范；其他语言保留 originalLanguage 并以纯文本显示' }, example: { type: 'codeBlock', props: { language: 'typescript' }, content: 'await handleRequest(request)' } },
  callout: { ...textFields, props: { ...textFields.props, emoji: 'emoji or icon:<name>:<color>' }, example: { type: 'callout', props: { emoji: '💡', backgroundColor: 'blue' }, content: '结论与限制' } },
  table: { content: '{type:"tableContent",rows:[{cells:["标题","值"]}]}；每个 cell 是字符串、行内数组或 {type:"tableCell",content:[...]}，不能直接放单个 text 对象', props: {}, example: { type: 'table', content: { type: 'tableContent', rows: [{ cells: ['模块', '实现'] }, { cells: ['Core', [{ type: 'text', text: 'Node', styles: { bold: true } }]] }] } } },
  divider: { content: 'omit', example: { type: 'divider' } },
  image: { content: 'omit', props: { url: 'stable asset://local/... or https URL', caption: 'string', previewWidth: 'number' }, example: { type: 'image', props: { url: 'https://example.com/image.png', caption: '说明' } } },
  video: { content: 'omit', props: { url: 'asset or https URL', caption: 'string' }, example: { type: 'video', props: { url: 'https://example.com/video.mp4' } } },
  audio: { content: 'omit', props: { url: 'asset or https URL', caption: 'string' }, example: { type: 'audio', props: { url: 'https://example.com/audio.mp3' } } },
  file: { content: 'omit', props: { url: 'asset or https URL', name: 'filename' }, example: { type: 'file', props: { url: 'https://example.com/source.txt', name: 'source.txt' } } },
  pageLink: { content: 'omit', props: { pageId: 'existing target page ID' }, example: { type: 'pageLink', props: { pageId: 'PAGE_ID' } } },
  tableOfContents: { content: 'omit; generated from current headings', example: { type: 'tableOfContents' } },
  columnList: { content: 'omit', children: 'column blocks only', example: { type: 'columnList', children: [{ type: 'column', children: [{ type: 'paragraph', content: '左栏' }] }, { type: 'column', children: [{ type: 'paragraph', content: '右栏' }] }] } },
  column: { content: 'omit; only valid inside columnList', children: 'block array', example: { type: 'column', children: [{ type: 'paragraph', content: '栏内正文' }] } },
  databaseView: { content: 'omit', props: { databaseId: 'existing database page ID', title: 'string', linked: 'boolean', viewState: 'JSON string for linked view state' }, example: { type: 'databaseView', props: { databaseId: 'DATABASE_ID', title: '模块索引', linked: false } }, preferredCommand: 'database.embed' },
  syncedBlock: { content: 'omit', props: { sourceId: 'ID from sync.create' }, example: { type: 'syncedBlock', props: { sourceId: 'SOURCE_ID' } }, preferredCommand: 'sync.create / sync.link' },
  button: { content: 'omit', props: { label: 'string', confirmation: 'optional confirmation text', actions: 'JSON string of action steps; use schema button.create' }, example: { type: 'button', props: { label: '操作', actions: '[]' } }, preferredCommand: 'button.create' },
  equation: { content: 'omit', props: { expression: 'LaTeX string', textColor: 'color', backgroundColor: 'color' }, example: { type: 'equation', props: { expression: 'E=mc^2' } } },
  bookmark: { content: 'omit', props: { url: 'http/https/mininotion URL', title: 'string', description: 'string' }, example: { type: 'bookmark', props: { url: 'https://example.com', title: '资料' } } },
  breadcrumb: { content: 'omit; derived from the page tree', example: { type: 'breadcrumb' } },
} as const;
export const inlineContentTypes = ['text', 'link', 'pageMention', 'inlineMath'] as const;
function normalizedInline(value: any): any {
  if (!Array.isArray(value)) return value;
  return value.map(item => {
    if (typeof item === 'string') return { type: 'text', text: item, styles: {} };
    if (item?.type === 'text') return { ...item, styles: item.styles || {} };
    if (item?.type === 'link') return { ...item, content: typeof item.content === 'string' ? normalizedInline([item.content]) : normalizedInline(item.content) };
    return item;
  });
}
function normalizedContent(block: JsonBlock) {
  const content = block.content;
  if (block.type !== 'table') return normalizedInline(content);
  if (!content || !Array.isArray(content.rows)) return content;
  return { ...content, type: content.type ?? 'tableContent', rows: content.rows.map((row: any) => ({
    ...row, cells: Array.isArray(row.cells) ? row.cells.map((cell: any) =>
      cell?.type === 'tableCell' ? { ...cell, content: normalizedInline(cell.content) } : normalizedInline(cell)) : row.cells,
  })) };
}
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
      ...(block.content !== undefined ? { content: normalizedContent(block) } : {}),
      ...(block.type === 'codeBlock' ? { props: {
        ...block.props,
        language: normalizeCodeLanguage(block.props?.language),
        ...(block.props?.language && normalizeCodeLanguage(block.props.language) === 'text' && !['text', 'txt', 'plaintext', 'plain'].includes(String(block.props.language).toLowerCase())
          ? { originalLanguage: String(block.props.language) } : {}),
      } } : {}),
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
      (!block.content || !Array.isArray(block.content.rows) || block.content.type !== 'tableContent')
    )
      throw new CommandError('INVALID_TABLE',  '表格需要 content:{type:"tableContent",rows:[{cells:["列名","值"]}]}；执行 mininotion schema block.validate --compact 查看示例' );
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
  if (!Array.isArray(content)) throw new CommandError('INVALID_CONTENT',  '文本/表格单元格需要字符串或行内数组，例如 "正文" 或 [{type:"text",text:"正文",styles:{}}]；不能直接传单个 text 对象' );
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
