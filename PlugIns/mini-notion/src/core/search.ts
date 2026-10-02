import type { Page } from '../types.ts';
import { ancestors, descendants, isInternalPage, plainText, readProperty } from '../model.ts';
import { materializeBlocks } from '../content/references.ts';
import { flattenBlocks } from './blocks.ts';
import { CommandError } from './errors.ts';

export const searchSorts = ['relevance', 'edited-desc', 'edited-asc', 'created-desc', 'created-asc'] as const;
export type SearchOptions = {
  titleOnly?: boolean;
  inPageId?: string;
  kind?: 'all' | 'page' | 'database';
  sort?: (typeof searchSorts)[number];
  dateField?: 'edited' | 'created';
  after?: string;
  before?: string;
};
export function searchTerms(query: string): string[] {
  return [...query.toLocaleLowerCase().matchAll(/"([^"]+)"|(\S+)/g)].map((match) => match[1] || match[2]);
}
export function searchPages(pages: Page[], query: string, options: SearchOptions = {}): Page[] {
  const words = searchTerms(query),
    sort = options.sort || 'relevance';
  if (!searchSorts.includes(sort)) throw new CommandError('INVALID_SEARCH', '未知搜索排序');
  if (options.kind && !['all', 'page', 'database'].includes(options.kind))
    throw new CommandError('INVALID_SEARCH', 'kind 需要 all/page/database');
  if (options.dateField && !['edited', 'created'].includes(options.dateField))
    throw new CommandError('INVALID_SEARCH', 'dateField 需要 edited/created');
  const scope = options.inPageId ? descendants(pages, options.inPageId) : null;
  if (options.inPageId && !pages.some((page) => page.id === options.inPageId && !page.trashedAt))
    throw new CommandError('PAGE_NOT_FOUND', '搜索范围页面不存在');
  const boundary = (value: string | undefined, end: boolean) => {
    if (!value) return end ? Infinity : -Infinity;
    const time = Date.parse(
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + (end ? 'T23:59:59.999' : 'T00:00:00') : value,
    );
    if (!Number.isFinite(time)) throw new CommandError('INVALID_SEARCH', '搜索日期无效');
    return time;
  };
  const after = boundary(options.after, false),
    before = boundary(options.before, true);
  const titleMatches = (page: Page) => words.every((word) => page.title.toLocaleLowerCase().includes(word));
  return pages
    .filter((page) => {
      if (page.trashedAt || isInternalPage(page, pages) || (scope && !scope.has(page.id))) return false;
      if ((options.kind === 'database' && !page.database) || (options.kind === 'page' && page.database))
        return false;
      const time = options.dateField === 'created' ? page.createdAt : page.updatedAt;
      if (time < after || time > before) return false;
      if (options.titleOnly) return titleMatches(page);
      const columns = pages.find((owner) => owner.id === page.parentId)?.database?.columns || [];
      const text =
        `${page.title} ${plainText(materializeBlocks(page.blocks, { pages }))} ${Object.values(page.values).join(' ')} ${columns.map((column) => readProperty(page, column, pages)).join(' ')}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => {
      if (sort === 'relevance')
        return Number(titleMatches(b)) - Number(titleMatches(a)) || b.updatedAt - a.updatedAt;
      const field = sort.startsWith('created') ? 'createdAt' : 'updatedAt';
      return (a[field] - b[field]) * (sort.endsWith('asc') ? 1 : -1);
    });
}
export function searchMatch(page: Page, query: string, pages: Page[]) {
  const words = searchTerms(query);
  const blocks = flattenBlocks(page.blocks);
  const match = blocks.find(
    ({ block }) =>
      words.length &&
      words.some((word) =>
        plainText(
          block.type === 'syncedBlock' ? materializeBlocks([block], { pages }) : { ...block, children: [] },
        )
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
  const text = match
    ? plainText(
        match.block.type === 'syncedBlock'
          ? materializeBlocks([match.block], { pages })
          : { ...match.block, children: [] },
      )
    : plainText(materializeBlocks(page.blocks, { pages }));
  const offset = Math.max(
    0,
    Math.min(...words.map((word) => text.toLocaleLowerCase().indexOf(word)).filter((at) => at >= 0)) - 45,
  );
  const start = Number.isFinite(offset) ? offset : 0;
  return {
    excerpt: (start ? '…' : '') + text.slice(start, start + 180) + (text.length > start + 180 ? '…' : ''),
    blockId: match?.block.id,
    path: ancestors(pages, page.id)
      .map((parent) => parent.title || '无标题')
      .join(' / '),
  };
}
