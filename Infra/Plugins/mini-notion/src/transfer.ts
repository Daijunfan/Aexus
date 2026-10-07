import type { JsonBlock, Page, Workspace, FileValue } from './types';
import { makePage, readProperty, isTemplatePage } from './model.ts';
import { materializeBlocks } from './content/references.ts';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || !value) quoted = !quoted;
      else value += char;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('CSV 引号没有闭合，请检查文件。');
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export function csvPages(name: string, text: string): Page[] {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('CSV 文件是空的。');
  const database = makePage({
    title: name.replace(/\.csv$/i, ''),
    icon: '📋',
    fullWidth: true,
    database: {
      columns: rows[0]
        .slice(1)
        .map((name, i) => ({ id: `column-${i}`, name: name || `属性 ${i + 1}`, type: 'text' })),
      view: 'table',
    },
  });
  return [
    database,
    ...rows
      .slice(1)
      .filter((row) => row.some(Boolean))
      .map((row) =>
        makePage({
          parentId: database.id,
          title: row[0] || '',
          values: Object.fromEntries(
            database.database!.columns.map((column, i) => [column.id, row[i + 1] || '']),
          ),
        }),
      ),
  ];
}

export function databaseCSV(page: Page, workspace: Workspace): string {
  const columns = page.database!.columns;
  const escape = (value: unknown) =>
    `"${String(Array.isArray(value) ? value.join(', ') : (value ?? '')).replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [
      ['名称', ...columns.map((c) => c.name)],
      ...workspace.pages
        .filter(
          (p) =>
            p.parentId === page.id &&
            !p.trashedAt &&
            !p.templateFor &&
            (!isTemplatePage(p, workspace.pages) || isTemplatePage(page, workspace.pages)),
        )
        .map((p) => [
          p.title,
          ...columns.map((c) =>
            c.type === 'files'
              ? ((p.values[c.id] || []) as FileValue[]).map((file) => file.url).join(', ')
              : readProperty(p, c, workspace.pages),
          ),
        ]),
    ]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')
  );
}

export function portableBlocks(blocks: JsonBlock[], workspace: Workspace): JsonBlock[] {
  const transformInline = (value: any): any => {
    if (!Array.isArray(value)) return value;
    return value.map((item) =>
      item.type === 'pageMention'
        ? {
            type: 'link',
            href: `mininotion://page/${item.props.pageId}`,
            content: [
              {
                type: 'text',
                text:
                  workspace.pages.find((p) => p.id === item.props.pageId)?.title ||
                  item.props.title ||
                  '无标题',
                styles: {},
              },
            ],
          }
        : item,
    );
  };
  return materializeBlocks(blocks, workspace)
    .filter((b) => b.type !== 'tableOfContents')
    .map((b) => {
      if (b.type === 'button') return { type: 'paragraph', content: `[按钮：${b.props?.label || '按钮'}]` };
      if (b.type === 'pageLink' || b.type === 'databaseView')
        return {
          type: 'paragraph',
          content: [
            {
              type: 'link',
              href: `mininotion://page/${b.props?.pageId || b.props?.databaseId}`,
              content: [
                {
                  type: 'text',
                  text:
                    workspace.pages.find((p) => p.id === (b.props?.pageId || b.props?.databaseId))?.title ||
                    '页面',
                  styles: {},
                },
              ],
            },
          ],
        };
      return {
        ...b,
        type: b.type === 'callout' ? 'quote' : b.type,
        content: transformInline(b.content),
        children: b.children ? portableBlocks(b.children, workspace) : undefined,
      };
    });
}
