import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
  TableRowHeaderItem,
  TableColumnHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react';
import { useWorkspace } from '../store';
import { plainText } from '../model';

export function BlockMenu({ pageId }: { pageId: string }) {
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  const Components = useComponentsContext()!;
  const { command, setCommentPanel, notify } = useWorkspace();
  if (!block) return null;
  const selected = editor.getSelection()?.blocks;
  const ids = selected?.some((item) => item.id === block.id) ? selected.map((item) => item.id) : [block.id];
  return (
    <DragHandleMenu>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        onClick={() =>
          setCommentPanel({ pageId, blockId: block.id, quote: plainText(block.content).slice(0, 500) })
        }
      >
        评论此块
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
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
      <RemoveBlockItem>删除</RemoveBlockItem>
      <BlockColorsItem>颜色</BlockColorsItem>
      <TableRowHeaderItem>标题行</TableRowHeaderItem>
      <TableColumnHeaderItem>标题列</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}
