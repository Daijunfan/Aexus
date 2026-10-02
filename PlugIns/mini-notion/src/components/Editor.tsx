import { codeLanguages, codeLanguageAliases, normalizeCodeLanguage } from '../core/codeLanguages';
import { saveAsset } from '../content/assets';
import { ButtonBlock } from '../actions/ButtonBlock';
import { MousePointer2 } from 'lucide-react';
import { useEffect, useRef, useState, useContext } from 'react';
import { EmojiPicker } from './Pickers';
import { emojis, matchesIcon } from '../core/iconSearch';
import { AllSelection } from '@tiptap/pm/state';
import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultProps,
} from '@blocknote/core';
import { createCodeBlockSpec } from '@blocknote/core/blocks';
import { zh } from '@blocknote/core/locales';
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  SyntaxHighlightingExtension,
} from '@blocknote/core/extensions';
import {
  withMultiColumn,
  multiColumnDropCursor,
  getMultiColumnSlashMenuItems,
  locales as columnLocales,
} from '@blocknote/xl-multi-column';
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  SideMenu,
  SideMenuController,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import {
  FilePlus2,
  Lightbulb,
  ArrowUpRight,
  ListTree,
  Database as DatabaseIcon,
  Link2,
  MessageSquare,
  Bot,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { PageIcon } from '../ui';
import { plainText, defaultDatabase, isInternalPage, ancestors } from '../model';
import { InlineDatabaseSpec } from '../database/InlineDatabase';
import type { Page, JsonBlock } from '../types';
import { EditorPageContext, syncedBlockSpec } from '../content/SyncedBlock';
import { BlockMenu } from './BlockMenu';
import { revealContent } from '../content/navigation';
import { NotionShortcuts, rememberColor } from '../content/shortcuts';
import { Bookmark, Breadcrumb } from '../content/ReferenceBlocks';
import { Equation, InlineMath } from '../content/Math';
import { Sigma, Copy, Trash2 } from 'lucide-react';
import { iconColors } from '../core/icons';

// Stable component identities keep the open block menu mounted during editor/store updates.
function EditorBlockMenu() {
  const { pageId } = useContext(EditorPageContext)!;
  return <BlockMenu pageId={pageId} />;
}
function EditorSideMenu() {
  return <SideMenu dragHandleMenu={EditorBlockMenu} />;
}

const Callout = createReactBlockSpec(
  { type: 'callout', propSchema: { ...defaultProps, emoji: { default: '💡' } }, content: 'inline' },
  {
    render: ({ block, contentRef, editor }) => {
      const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
      return <div className={`callout-block ${block.props.emoji ? '' : 'without-icon'}`}
        style={block.props.backgroundColor !== 'default' ? { background: 'transparent' } : undefined}>
        <button className={`callout-emoji ${block.props.emoji ? '' : 'empty'}`} contentEditable={false}
          disabled={!editor.isEditable} aria-label="切换提示图标" onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect(); setPicker({ x: rect.left, y: rect.bottom + 4 });
          }}>
          {block.props.emoji ? <PageIcon icon={block.props.emoji} size={21} /> : <Lightbulb size={16} />}
        </button>
        <div ref={contentRef} className="callout-content" />
        {picker && <EmojiPicker {...picker} value={block.props.emoji} onClose={() => setPicker(null)}
          onChange={emoji => editor.updateBlock(block, { props: { emoji } })} />}
      </div>;
    },
    toExternalHTML: ({ block, contentRef }) => (
      <aside>
        {block.props.emoji && <PageIcon icon={block.props.emoji} size={21} />}
        <div ref={contentRef} />
      </aside>
    ),
  },
);

const PageLink = createReactBlockSpec(
  { type: 'pageLink', propSchema: { ...defaultProps, pageId: { default: '' }, title: { default: '页面' } }, content: 'none' },
  {
    render: ({ block }) => {
      const { workspace, navigate } = useWorkspace();
      const page = workspace?.pages.find((p) => p.id === block.props.pageId && !p.trashedAt);
      return (
        <button
          contentEditable={false}
          className={`page-link-block ${!page ? 'missing-link' : ''}`}
          onClick={event => page && navigate(page.id, undefined, event.metaKey || event.ctrlKey ? 'new' : undefined)}
        >
          <PageIcon icon={page?.icon} />
          <span>{page ? page.title || '无标题' : '页面已删除'}</span>
          <ArrowUpRight size={14} />
        </button>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>
        <a href={`mininotion://page/${block.props.pageId}`}>{block.props.title}</a>
      </p>
    ),
  },
);

const Mention = createReactInlineContentSpec(
  {
    type: 'pageMention',
    propSchema: { pageId: { default: '' }, title: { default: '页面' } },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const { workspace, navigate } = useWorkspace();
      const page = workspace?.pages.find((p) => p.id === inlineContent.props.pageId && !p.trashedAt);
      return (
        <span
          className="page-mention"
          contentEditable={false}
          role="link"
          onClick={event => page && navigate(page.id, undefined, event.metaKey || event.ctrlKey ? 'new' : undefined)}
        >
          <PageIcon icon={page?.icon} size={14} />
          {page ? page.title || '无标题' : '已删除页面'}
        </span>
      );
    },
    toExternalHTML: ({ inlineContent }) => (
      <a href={`mininotion://page/${inlineContent.props.pageId}`}>{inlineContent.props.title}</a>
    ),
  },
);

const TableOfContents = createReactBlockSpec(
  { type: 'tableOfContents', propSchema: { ...defaultProps }, content: 'none' },
  {
    render: ({ editor }) => {
      const headings: JsonBlock[] = [];
      const collect = (blocks: JsonBlock[]) =>
        blocks.forEach((block) => {
          if (block.type === 'heading') headings.push(block);
          if (block.children) collect(block.children);
        });
      collect(editor.document as JsonBlock[]);
      return (
        <div className="table-of-contents" contentEditable={false}>
          {headings.length ? (
            headings.map((b) => (
              <button
                key={b.id}
                style={{ paddingLeft: (Number(b.props?.level) - 1) * 16 }}
                onClick={() =>
                  document
                    .querySelector(`[data-id="${b.id}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {plainText(b.content) || '无标题'}
              </button>
            ))
          ) : (
            <span>添加标题后，目录将显示在这里。</span>
          )}
        </div>
      );
    },
    toExternalHTML: () => <p>目录</p>,
  },
);

const codeBlock = createCodeBlockSpec({
  defaultLanguage: 'text',
  indentLineWithTab: true,
  supportedLanguages: Object.fromEntries(
    [...codeLanguages, ...Object.keys(codeLanguageAliases)].map(language => [language, {
      name: language === 'text' ? '纯文本' : language === 'shellscript' ? 'Shell' : language,
    }]),
  ),
});
// Old documents and pasted fences may have aliases or unsupported language IDs.
// Render them without throwing; Core normalizes aliases and preserves the source label.
codeBlock.config = { ...codeBlock.config, propSchema: { ...codeBlock.config.propSchema, originalLanguage: { default: '' } } } as typeof codeBlock.config;
const renderCodeBlock = codeBlock.implementation.render;
codeBlock.implementation.render = function (block, editor) { return renderCodeBlock.call(this, { ...block, props: { ...block.props, language: normalizeCodeLanguage(block.props.language) } }, editor); };
codeBlock.implementation.meta = { ...codeBlock.implementation.meta, highlight: block => normalizeCodeLanguage(block.props.language) };
export const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      codeBlock,
      equation: Equation(),
      bookmark: Bookmark(),
      breadcrumb: Breadcrumb(),
      button: ButtonBlock(),
      callout: Callout(),
      pageLink: PageLink(),
      tableOfContents: TableOfContents(),
      databaseView: InlineDatabaseSpec(),
      syncedBlock: syncedBlockSpec((page, theme, readOnly) => (
        <Editor page={page} theme={theme} readOnly={readOnly} />
      )),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, pageMention: Mention, inlineMath: InlineMath },
  }),
);
export const editorDictionary = {
  ...zh,
  multi_column: columnLocales.zh,
  placeholders: {
    ...zh.placeholders,
    default: "输入文字，或按 '/' 选择块类型",
    emptyDocument: "输入文字，或按 '/' 选择块类型",
  },
};
export function createExportEditor() {
  return BlockNoteEditor.create({
    schema,
    dictionary: editorDictionary,
    links: { isValidLink: (href) => /^(https?:|mailto:|asset:|mininotion:|#)/i.test(href) },
  });
}

export { saveAsset } from '../content/assets';

export function Editor({
  page,
  theme,
  autoFocus = false,
  readOnly = false,
}: {
  page: Page;
  theme: 'light' | 'dark';
  autoFocus?: boolean;
  readOnly?: boolean;
}) {
  const { patch, workspace, create, navigate, notify, getCurrentPage, setCommentPanel, setAgentPanel, command, blockTarget } =
    useWorkspace();
  const editorContainer = useRef<HTMLDivElement>(null);
  const editor = useCreateBlockNote({
    schema,
    dropCursor: multiColumnDropCursor,
    extensions: [
      NotionShortcuts(),
      SyntaxHighlightingExtension({
        createHighlighter: () => import('../highlight').then((module) => module.highlighter),
      }),
    ],
    dictionary: editorDictionary,
    initialContent: page.blocks.length ? (page.blocks as any) : undefined,
    pasteHandler: ({ event, editor: activeEditor, defaultPasteHandler }) => {
      const html = event.clipboardData?.getData('text/html');
      const sourceId = html
        ? new DOMParser()
            .parseFromString(html, 'text/html')
            .querySelector('[data-mini-notion-sync]')
            ?.getAttribute('data-mini-notion-sync')
        : undefined;
      const source = sourceId ? getCurrentPage(sourceId) : undefined;
      if (!source?.syncedSource || source.trashedAt) return defaultPasteHandler();
      event.preventDefault();
      try {
        const block = activeEditor.getTextCursorPosition().block;
        command('sync.link', { sourceId, pageId: page.id, afterId: block.id, replaceEmptyId: block.id });
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
      }
      return true;
    },
    uploadFile: async (file) => {
      try {
        return await saveAsset(file);
      } catch (error) {
        notify('附件保存失败，请重试');
        throw error;
      }
    },
    links: {
      isValidLink: (href) => /^(https?:|mailto:|asset:|mininotion:|#)/i.test(href),
      onClick: (event) => {
        const url = (event.target as HTMLElement).closest('a')?.getAttribute('href');
        if (!url) return;
        if (url.startsWith('mininotion://page/')) navigate(url.slice('mininotion://page/'.length));
        else if (window.native) void window.native.openExternal(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
  });

  const syncedBlocks = useRef({
    source: JSON.stringify(page.blocks),
    rendered: JSON.stringify(editor.document),
  });
  const applyingExternal = useRef(false);
  const replaceContent = (blocks: JsonBlock[]) => {
    syncedBlocks.current.source = JSON.stringify(blocks);
    applyingExternal.current = true;
    try {
      if (syncedBlocks.current.source !== JSON.stringify(editor.document))
        editor.replaceBlocks(editor.document, blocks as any);
      // BlockNote fills in default props. Rendering those defaults is not an edit.
      syncedBlocks.current.rendered = JSON.stringify(editor.document);
    } finally {
      applyingExternal.current = false;
    }
  };
  const commentSelection = () => {
    const block = editor.getSelection()?.blocks[0] || editor.getTextCursorPosition().block;
    setCommentPanel({
      pageId: page.id,
      blockId: block.id,
      quote: window.getSelection()?.toString() || plainText(block.content),
    });
  };
  const sendSelectionToAgent = () => {
    const root = [page, ...ancestors(workspace!.pages, page.id)].find((page) => page.space);
    if (!root) return;
    const block = editor.getSelection()?.blocks[0] || editor.getTextCursorPosition().block;
    setAgentPanel({ pageId: root.id, context: { pageId: page.id, title: page.title, blockId: block.id, quote: window.getSelection()?.toString() || plainText(block.content) } });
  };
  useEffect(() => {
    const element = editorContainer.current;
    if (!element) return;
    const selectDocument = () => {
      editor.transact((tr) => tr.setSelection(new AllSelection(tr.doc)));
      editor.focus();
    };
    const selectAll = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'a' &&
        (event.target as HTMLElement).closest('[data-editor-page]') === element
      ) {
        event.preventDefault();
        event.stopPropagation();
        selectDocument();
      }
    };
    const nativeSelectAll = () => {
      if (document.activeElement?.closest('[data-editor-page]') === element) selectDocument();
    };
    const nativeComment = () => {
      if (document.activeElement?.closest('[data-editor-page]') === element) commentSelection();
    };
    element.addEventListener('keydown', selectAll);
    window.addEventListener('mini:select-all', nativeSelectAll);
    window.addEventListener('mini:comment-selection', nativeComment);
    return () => {
      element.removeEventListener('keydown', selectAll);
      window.removeEventListener('mini:select-all', nativeSelectAll);
      window.removeEventListener('mini:comment-selection', nativeComment);
    };
  }, [editor]);
  useEffect(() => {
    if (autoFocus) {
      editor.focus();
      editor.setTextCursorPosition(editor.document[0], 'start');
    }
  }, [editor, autoFocus]);
  useEffect(() => {
    // A delayed React effect must not replace text typed after that render.
    if (page.blocks !== getCurrentPage(page.id)?.blocks) return;
    if (JSON.stringify(page.blocks) === syncedBlocks.current.source) return;
    replaceContent(page.blocks);
  }, [editor, page.blocks]);

  useEffect(() => {
    if (!blockTarget || blockTarget.pageId !== page.id) return;
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-editor-page="${CSS.escape(page.id)}"] [data-id="${CSS.escape(blockTarget.blockId)}"]`);
      if (element) revealContent(element);
    });
    return () => cancelAnimationFrame(frame);

  }, [editor, blockTarget, page.id, page.blocks]);


  useEffect(() => {
    const focus = (e: Event) => {
      if ((e as CustomEvent).detail === page.id) {
        editor.focus();
        editor.setTextCursorPosition(editor.document[0], 'start');
      }
    };
    const restore = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; blocks: JsonBlock[] }>).detail;
      if (detail.id === page.id) replaceContent(detail.blocks);
    };
    window.addEventListener('mini:focus', focus);
    window.addEventListener('mini:restore', restore);
    return () => {
      window.removeEventListener('mini:focus', focus);
      window.removeEventListener('mini:restore', restore);
    };
  }, [editor, page.id]);

  return (
    <EditorPageContext.Provider value={{ pageId: page.id, theme, readOnly: readOnly || page.locked }}>
      <div ref={editorContainer} className="note-editor" data-editor-page={page.id} data-block-target={blockTarget?.pageId === page.id ? blockTarget.blockId : undefined} spellCheck={workspace!.settings.spellcheck}>
        {blockTarget?.pageId === page.id && <style>{`
          @keyframes block-anchor-${blockTarget.request} { from { background-color: var(--selected); } to { background-color: transparent; } }
          [data-editor-page="${CSS.escape(page.id)}"] [data-id="${CSS.escape(blockTarget.blockId)}"] > .bn-block > .bn-block-content {
            animation: block-anchor-${blockTarget.request} 2.2s ease-out;
          }
        `}</style>}
        <BlockNoteView
          editor={editor}
          theme={theme}
          editable={!page.locked && !readOnly}
          slashMenu={false}
          sideMenu={false}
          formattingToolbar={false}
          onChange={() => {
            if (applyingExternal.current) return;
            const blocks = editor.document as JsonBlock[];
            const serialized = JSON.stringify(blocks);
            if (serialized === syncedBlocks.current.rendered) return;
            syncedBlocks.current = { source: serialized, rendered: serialized };
            if (!patch(page.id, { blocks })) {
              const saved = getCurrentPage(page.id)!.blocks;
              replaceContent(saved);
            }
          }}
        >
          <SideMenuController sideMenu={EditorSideMenu} />
          <FormattingToolbarController
            formattingToolbar={(props) => (
              <FormattingToolbar {...props}>
                {getFormattingToolbarItems(props.blockTypeSelectItems)}
                <button
                  className="block-comment-button"
                  title="评论"
                  aria-label="评论所选内容"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={commentSelection}
                >
                  <MessageSquare size={16} />
                </button>
                <button className="block-comment-button" title="发送选区给 Agent" aria-label="发送选区给 Agent" onMouseDown={(event) => event.preventDefault()} onClick={sendSelectionToAgent}><Bot size={16}/></button>
              </FormattingToolbar>
            )}
          />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor),
                  ...Object.entries(iconColors).flatMap(([color, tone]) => (['textColor', 'backgroundColor'] as const).map(field => ({
                    title: tone.name + (field === 'backgroundColor' ? '背景' : '文字'),
                    subtext: field === 'backgroundColor' ? '更改当前块的背景色' : '更改当前块的文字颜色',
                    aliases: [color + (field === 'backgroundColor' ? ' background' : ''), tone.name + (field === 'backgroundColor' ? '背景' : '')],
                    group: '颜色', icon: <span className="block-color-sample" style={{ color: tone[theme] }}>A</span>,
                    onItemClick: () => { rememberColor(field, color); editor.updateBlock(editor.getTextCursorPosition().block, { props: { [field]: color } }); },
                  }))),
                  { title: '复制块', aliases: ['duplicate', '复制'], group: '操作', icon: <Copy size={20} />,
                    onItemClick: () => command('block.duplicate', { pageId: page.id, blockId: editor.getTextCursorPosition().block.id }) },
                  { title: '删除块', aliases: ['delete', 'remove', '删除'], group: '操作', icon: <Trash2 size={20} />,
                    onItemClick: () => command('block.delete', { pageId: page.id, ids: [editor.getTextCursorPosition().block.id] }) },
                  {
                    title: '按钮',
                    subtext: '一键执行多步操作',
                    aliases: ['button', '按钮'],
                    group: '高级块',
                    icon: <MousePointer2 size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'button' }),
                  },
                  ...getMultiColumnSlashMenuItems(editor),
                  {
                    title: '同步块',
                    subtext: '同一份内容，在多处同步编辑',
                    aliases: ['synced', 'sync', '同步'],
                    group: '高级块',
                    icon: <RefreshCw size={20} />,
                    onItemClick: () => {
                      const block = editor.getTextCursorPosition().block;
                      command('sync.create', {
                        pageId: page.id,
                        blockIds: [block.id],
                        blocks: [{ type: 'paragraph', content: '' }],
                      });
                    },
                  },
                  {
                    title: '引用同步内容',
                    subtext: '选择已有的共享内容',
                    aliases: ['link synced', '引用同步'],
                    group: '高级块',
                    icon: <Link2 size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'syncedBlock' }),
                  },
                  {
                    title: '数据库 · 内联',
                    subtext: '在当前笔记中创建完整数据库',
                    aliases: ['database', 'db', '内联数据库'],
                    group: '数据库',
                    icon: <DatabaseIcon size={20} />,
                    onItemClick: () => {
                      const source = create(
                        {
                          parentId: page.id,
                          title: '无标题数据库',
                          icon: '📋',
                          database: defaultDatabase(),
                          fullWidth: true,
                        },
                        false,
                      );
                      insertOrUpdateBlockForSlashMenu(editor, {
                        type: 'databaseView',
                        props: { databaseId: source.id, title: source.title },
                      });
                    },
                  },
                  {
                    title: '数据库 · 完整页面',
                    subtext: '创建可独立打开的数据库',
                    aliases: ['full database', '完整数据库', '全页面数据库'],
                    group: '数据库',
                    icon: <DatabaseIcon size={20} />,
                    onItemClick: () => {
                      const source = create(
                        { parentId: page.id, icon: '📋', database: defaultDatabase(), fullWidth: true },
                        false,
                      );
                      insertOrUpdateBlockForSlashMenu(editor, {
                        type: 'pageLink',
                        props: { pageId: source.id },
                      });
                      navigate(source.id);
                    },
                  },
                  {
                    title: '关联数据库视图',
                    subtext: '引用现有数据，单独设置视图与筛选',
                    aliases: ['linked database', '关联数据库', '数据源'],
                    group: '数据库',
                    icon: <Link2 size={20} />,
                    onItemClick: () =>
                      insertOrUpdateBlockForSlashMenu(editor, {
                        type: 'databaseView',
                        props: { linked: true },
                      }),
                  },
                  {
                    title: '网页书签', subtext: '保存链接、标题和说明', aliases: ['bookmark', '书签'], group: '媒体', icon: <Link2 size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'bookmark' }),
                  },
                  {
                    title: '面包屑导航', subtext: '显示当前页面所在位置', aliases: ['breadcrumb', '面包屑', '路径'], group: '高级块', icon: <ListTree size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'breadcrumb' }),
                  },
                  {
                    title: '块公式', subtext: '使用 LaTeX 编写数学公式', aliases: ['equation', 'math', 'latex', '公式'], group: '高级块', icon: <Sigma size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'equation', props: { expression: '' } }),
                  },
                  {
                    title: '行内公式', subtext: '在文字中插入数学公式', aliases: ['inline equation', 'inline math', '行内公式'], group: '行内', icon: <Sigma size={20} />,
                    onItemClick: () => editor.insertInlineContent([{ type: 'inlineMath', props: { expression: '' } }, ' ']),
                  },
                  {
                    title: '提示',
                    subtext: '让一段文字更醒目',
                    aliases: ['callout', 'tip', '提示'],
                    group: '基本块',
                    icon: <Lightbulb size={20} />,
                    onItemClick: () =>
                      insertOrUpdateBlockForSlashMenu(editor, { type: 'callout', props: { emoji: '💡' } }),
                  },
                  {
                    title: '页面',
                    subtext: '在当前页面中创建子页面',
                    aliases: ['page', '页面', '子页面'],
                    group: '基本块',
                    icon: <FilePlus2 size={20} />,
                    onItemClick: () => {
                      const child = create({ parentId: page.id }, false);
                      insertOrUpdateBlockForSlashMenu(editor, {
                        type: 'pageLink',
                        props: { pageId: child.id },
                      });
                      navigate(child.id);
                    },
                  },
                  {
                    title: '目录',
                    subtext: '跳转到页面中的各个标题',
                    aliases: ['toc', 'contents', '目录'],
                    group: '高级块',
                    icon: <ListTree size={20} />,
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'tableOfContents' }),
                  },
                ],
                query,
              )
            }
          />
          <SuggestionMenuController
            triggerCharacter=":"
            minQueryLength={2}
            getItems={async query => emojis.filter(item => matchesIcon(query, item.emoji, item.name, item.keywords)).slice(0, 40).map(item => ({
              title: item.name, icon: <PageIcon icon={item.emoji} />,
              onItemClick: () => editor.insertInlineContent(item.emoji + ' '),
            }))}
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) =>
              workspace!.pages
                .filter(
                  (p) =>
                    !p.trashedAt &&
                    !isInternalPage(p, workspace!.pages) &&
                    p.id !== page.id &&
                    p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                )
                .map((p) => ({
                  title: p.title || '无标题',
                  icon: <PageIcon icon={p.icon} />,
                  onItemClick: () =>
                    editor.insertInlineContent([
                      { type: 'pageMention', props: { pageId: p.id, title: p.title || '无标题' } },
                      ' ',
                    ]),
                }))
            }
          />
        </BlockNoteView>
      </div>
    </EditorPageContext.Provider>
  );
}
