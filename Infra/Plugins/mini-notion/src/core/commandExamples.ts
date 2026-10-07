import type { CommandParams } from './protocol.ts';
import type { DatabaseView, JsonBlock, Property } from '../types.ts';

const view = {
  calendarBy: 'date',
  groupBy: 'status',
  dateAnchor: '2026-09-11',
  filters: {
    id: 'filter-group',
    conjunction: 'and',
    rules: [{ id: 'filter-1', property: 'status', operator: 'is', value: 'Todo' }],
  },
  sorts: [{ id: 'sort-1', property: 'priority', direction: 'desc' }],
} satisfies Partial<DatabaseView>;
const columns = [
  { id: 'status', name: 'Status', type: 'select', options: ['Todo', 'Done'] },
  { id: 'date', name: 'Date', type: 'date' },
  { id: 'priority', name: 'Priority', type: 'number' },
] satisfies Property[];
const blocks = [
  { type: 'heading', props: { level: 2 }, content: 'Overview' },
  { type: 'paragraph', content: [{ type: 'text', text: 'Important', styles: { bold: true } }] },
  { type: 'checkListItem', props: { checked: false }, content: 'Verify the result' },
  { type: 'callout', props: { emoji: '⚠️', backgroundColor: 'red' }, content: 'Confirm the deadline' },
] satisfies JsonBlock[];

/** Executable parameter examples, kept next to the shared command contract. Replace IDs with actual IDs. */
export const commandExamples: Record<string, CommandParams[]> = {
  'page.create': [{ title: 'Project', color: 'blue', parentId: '<mainPageId>', blocks }],
  'page.update': [{ pageId: '<pageId>', changes: { blocks } }, { pageId: '<pageId>', changes: { color: 'green', textColor: 'default' } }],
  'block.append': [{ pageId: '<pageId>', blocks }, { pageId: '<pageId>', type: 'equation', props: { expression: 'E = mc^2' } }, { pageId: '<pageId>', blocks: [{ type: 'paragraph', content: [{ type: 'inlineMath', props: { expression: 'x^2' } }] }] }],
  'block.duplicate': [{ pageId: '<pageId>', blockId: '<firstBlockId>', ids: ['<firstBlockId>', '<secondBlockId>'] }],
  'block.move': [{ pageId: '<pageId>', blockId: '<firstBlockId>', ids: ['<firstBlockId>', '<secondBlockId>'], targetPageId: '<targetPageId>' }],
  search: [{ query: '"local first"', titleOnly: false, inPageId: '<pageId>', sort: 'edited-desc' }],
  'page.open': [{ pageId: '<pageId>', blockId: '<blockId>' }, { pageId: '<pageId>', mode: 'tab' }],
  'block.update': [{ pageId: '<pageId>', blockId: '<blockId>', text: 'Revised content' }],
  'database.create': [{ parentId: '<mainPageId>', title: 'Tasks', color: 'blue', columns, view: 'table' }],
  'database.embed': [{ pageId: '<pageId>', databaseId: '<databaseId>' }],
  'property.add': [{ databaseId: '<databaseId>', name: 'Status', type: 'select', options: ['Todo', 'Done'] }],
  'record.create': [
    {
      databaseId: '<databaseId>',
      title: 'Release',
      color: 'red',
      values: {
        status: 'Todo',
        date: { start: '2026-09-18T09:00', end: '2026-09-18T10:00', timeZone: 'Asia/Shanghai' },
        priority: 2,
      },
    },
  ],
  'form.submit': [
    {
      databaseId: '<databaseId>',
      viewId: '<formViewId>',
      title: 'Response',
      values: { status: 'Todo', priority: 1 },
    },
  ],
  'record.update': [{ pageId: '<recordId>', values: { status: 'Done' } }],
  'view.create': [{ databaseId: '<databaseId>', type: 'calendar', name: 'Calendar', config: view }],
  'view.update': [{ databaseId: '<databaseId>', viewId: '<viewId>', changes: view }],
  'view.render': [{ databaseId: '<databaseId>', viewId: '<viewId>', date: '2026-09-11' }],
  'ui.command': [{ command: 'calendar-day', params: { pageId: '<databaseId>', viewId: '<visibleCalendarViewId>', date: '2026-09-20' } }, { command: 'appearance', params: { pageId: '<pageId>' } }],
  'settings.set': [{ changes: { appearance: { accentColor: 'green', surface: 'warm', density: 'comfortable', agentColor: 'purple', agentMessages: 'plain' } } }],
  'file.create': [
    { pageId: '<mainPageId>', name: 'report.md', content: '# Report\n\nSaved in the Workspace.' },
  ],
  'agent.send': [
    {
      pageId: '<mainPageId>',
      text: 'Summarize these files',
      files: ['/absolute/path/a.pdf', '/absolute/path/b.png'],
    },
    { pageId: '<mainPageId>', fileIds: ['<fileId>'] },
  ],
  'agent.start': [{ pageId: '<mainPageId>', prompt: 'Create a project page with a task database' }],
  batch: [
    {
      operations: [
        { method: 'page.update', params: { pageId: '<pageId>', title: 'Updated' } },
        { method: 'block.append', params: { pageId: '<pageId>', text: 'Content' } },
      ],
    },
  ],
};
