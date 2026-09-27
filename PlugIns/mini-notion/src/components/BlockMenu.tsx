import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  DragHandleMenu,
  TableRowHeaderItem,
  TableColumnHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react';
import { useWorkspace } from '../store';
import { plainText, isInternalPage } from '../model';
import { useState, useContext } from 'react';
import { Copy, ArrowRight, Type, MessageSquare, RefreshCw, Link, Trash2, Palette } from 'lucide-react';
import { PageIcon } from '../ui';
import { pageLink } from '../core/links';
import { iconColors } from '../core/icons';
import { AppearanceTheme } from '../appearance';
import { blockBackgrounds } from '../core/appearance';
import { rememberColor } from '../content/shortcuts';
import { selectedBlocks } from '../core/blocks';

export function BlockMenu({ pageId }: { pageId: string }) {
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  const Components = useComponentsContext()!;
  const { command, setCommentPanel, notify, workspace } = useWorkspace();
  const [query, setQuery] = useState('');
  const theme = useContext(AppearanceTheme);
  if (!block) return null;
  const selected = editor.getSelection()?.blocks;
  const ids = selected?.some((item) => item.id === block.id) ? selected.map((item) => item.id) : [block.id];
  const run = (method: string, params: Record<string, unknown> = {}) => {
    try {
      return command(method, { pageId, blockId: block.id, ids, ...params });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  };
  const targets = workspace!.pages.filter(
    (page) =>
      page.id !== pageId &&
      !page.trashedAt &&
      !page.locked &&
      !page.sourceFile &&
      !isInternalPage(page, workspace!.pages) &&
      page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const colorFields = (['textColor', 'backgroundColor'] as const).filter(field => ids.every(id => { const item = editor.getBlock(id)!; return Object.hasOwn(editor.schema.blockSchema[item.type].propSchema, field); }));
  const Menu = Components.Generic.Menu;
  return (
    <DragHandleMenu>
      {[
        'codeBlock',
        'paragraph',
        'heading',
        'bulletListItem',
        'numberedListItem',
        'checkListItem',
        'toggleListItem',
        'quote',
        'callout',
      ].includes(block.type) && (
        <Menu.Root position="right" sub>
          <Menu.Trigger sub>
            <Menu.Item className="bn-menu-item" subTrigger icon={<Type size={15} />}>
              转换为
            </Menu.Item>
          </Menu.Trigger>
          <Menu.Dropdown sub className="bn-menu-dropdown">
            {(
              [
                ['paragraph', '文本', undefined],
                ['heading', '标题 1', 1],
                ['heading', '标题 2', 2],
                ['heading', '标题 3', 3],
                ['bulletListItem', '无序列表', undefined],
                ['numberedListItem', '有序列表', undefined],
                ['checkListItem', '待办列表', undefined],
                ['toggleListItem', '折叠列表', undefined],
                ['quote', '引用', undefined],
                ['codeBlock', '代码', undefined],
                ['callout', '提示', undefined],
              ] as const
            ).map(([type, label, level]) => (
              <Menu.Item
                key={label}
                className="bn-menu-item"
                onClick={() => run('block.update', { type, ...(level ? { props: { level } } : {}) })}
              >
                {label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu.Root>
      )}
      <Menu.Item className="bn-menu-item" icon={<Copy size={15} />} onClick={() => run('block.duplicate')}>
        复制块
      </Menu.Item>
      <Menu.Root position="right" sub>
        <Menu.Trigger sub>
          <Menu.Item className="bn-menu-item" subTrigger icon={<ArrowRight size={15} />}>
            移动到
          </Menu.Item>
        </Menu.Trigger>
        <Menu.Dropdown sub className="bn-menu-dropdown block-move-menu">
          <input
            aria-label="搜索目标页面"
            placeholder="搜索页面…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
          {targets.map((page) => (
            <Menu.Item
              key={page.id}
              className="bn-menu-item"
              onClick={() => run('block.move', { targetPageId: page.id })}
            >
              <PageIcon icon={page.icon} size={16} />
              {page.title || '无标题'}
            </Menu.Item>
          ))}
          {!targets.length && <p className="icon-picker-empty">没有可用的页面</p>}
        </Menu.Dropdown>
      </Menu.Root>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<MessageSquare size={15} />}
        onClick={() =>
          setCommentPanel({ pageId, blockId: block.id, quote: plainText(block.content).slice(0, 500) })
        }
      >
        评论此块
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<RefreshCw size={15} />}
        onClick={() => {
          try {
            command('sync.create', { pageId, blockIds: ids });
          } catch (error) {
            notify(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        转为同步块
      </Components.Generic.Menu.Item>
      <Menu.Item
        className="bn-menu-item"
        icon={<Link size={15} />}
        onClick={() => {
          void navigator.clipboard.writeText(pageLink(pageId, block.id)).then(
            () => notify('已复制块链接'),
            () => notify('无法写入剪贴板'),
          );
        }}
      >
        复制块链接
      </Menu.Item>
      {colorFields.length > 0 && <Menu.Root position="right" sub>
        <Menu.Trigger sub>
          <Menu.Item className="bn-menu-item" subTrigger icon={<Palette size={15} />}>
            颜色
          </Menu.Item>
        </Menu.Trigger>
        <Menu.Dropdown sub className="bn-menu-dropdown notion-color-menu">
          {colorFields.map((field) => (
            <div key={field}>
              <div className="block-menu-label">{field === 'textColor' ? '文字颜色' : '背景颜色'}</div>
              {Object.entries(iconColors).map(([color, tone]) => (
                <Menu.Item
                  key={color}
                  className="bn-menu-item"
                  icon={
                    <span
                      aria-hidden="true"
                      className="block-color-sample"
                      style={{
                        color: field === 'textColor' ? tone[theme] : undefined,
                        background:
                          field === 'backgroundColor' && color !== 'default'
                            ? blockBackgrounds[color as keyof typeof blockBackgrounds][theme]
                            : undefined,
                      }}
                    >
                      A
                    </span>
                  }
                  checked={block.props[field] === color}
                  onClick={() => {
                    rememberColor(field, color);
                    run('block.update', { props: { [field]: color } });
                  }}
                >
                  {tone.name}
                  {field === 'backgroundColor' && color !== 'default' ? '背景' : ''}
                </Menu.Item>
              ))}
            </div>
          ))}
        </Menu.Dropdown>
      </Menu.Root>}
      <Menu.Item className="bn-menu-item" icon={<Trash2 size={15} />} onClick={() => run('block.delete')}>
        删除
      </Menu.Item>
      <div className="block-menu-label">
        {ids.length} 个块 · {[...plainText(selectedBlocks(editor.document, ids))].length} 个字符
      </div>
      <TableRowHeaderItem>标题行</TableRowHeaderItem>
      <TableColumnHeaderItem>标题列</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}
