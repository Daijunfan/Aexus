import { saveAsset } from '../content/assets';
import { ButtonBlock } from '../actions/ButtonBlock';
import { MousePointer2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
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

const Callout = createReactBlockSpec(
  { type: 'callout', propSchema: { ...defaultProps, emoji: { default: '💡' } }, content: 'inline' },
  {
    render: ({ block, contentRef, editor }) => (
      <div
        className="callout-block"
        style={block.props.backgroundColor !== 'default' ? { background: 'transparent' } : undefined}
      >
        <button
          className="callout-emoji"
          contentEditable={false}
          disabled={!editor.isEditable}
          aria-label="切换提示图标"
          onClick={() => {
            const icons = ['💡', '☀️', '📌', '✨', '⚠️', '✅', '🔒'];
            editor.updateBlock(block, {
              props: { emoji: icons[(icons.indexOf(block.props.emoji) + 1) % icons.length] },
            });
          }}
        >
          {block.props.emoji}
        </button>
        <div ref={contentRef} className="callout-content" />
      </div>
    ),
    toExternalHTML: ({ block, contentRef }) => (
      <aside>
        <span>{block.props.emoji} </span>
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
          onClick={() => page && navigate(page.id)}
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
          onClick={() => page && navigate(page.id)}
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
    [
      'text',
      'javascript',
      'typescript',
      'python',
      'json',
      'html',
      'css',
      'shellscript',
      'sql',
      'swift',
      'rust',
      'go',
      'yaml',
      'markdown',
    ].map((language) => [
      language,
      { name: language === 'text' ? '纯文本' : language === 'shellscript' ? 'Shell' : language },
    ]),
  ),
});
export const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      codeBlock,
      button: ButtonBlock(),
      callout: Callout(),
      pageLink: PageLink(),
      tableOfContents: TableOfContents(),
      databaseView: InlineDatabaseSpec(),
      syncedBlock: syncedBlockSpec((page, theme, readOnly) => (
        <Editor page={page} theme={theme} readOnly={readOnly} />
      )),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, pageMention: Mention },
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
  const { patch, workspace, create, navigate, notify, getCurrentPage, setCommentPanel, setAgentPanel, command } =
    useWorkspace();
  const editor = useCreateBlockNote({
    schema,
    dropCursor: multiColumnDropCursor,
    extensions: [
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
    const element = editor.prosemirrorView.dom;
    const selectDocument = () => {
      editor.transact((tr) => tr.setSelection(new AllSelection(tr.doc)));
      editor.focus();
    };
    const selectAll = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'a' &&
        (event.target as HTMLElement).closest('.bn-editor') === element
      ) {
        event.preventDefault();
        event.stopPropagation();
        selectDocument();
      }
    };
    const nativeSelectAll = () => {
      if (document.activeElement?.closest('.bn-editor') === element) selectDocument();
    };
    const nativeComment = () => {
      if (document.activeElement?.closest('.bn-editor') === element) commentSelection();
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
      <div className="note-editor" data-editor-page={page.id} spellCheck={workspace!.settings.spellcheck}>
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
          <SideMenuController
            sideMenu={(props) => (
              <SideMenu {...props} dragHandleMenu={() => <BlockMenu pageId={page.id} />} />
            )}
          />
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
