import { createExtension } from '@blocknote/core';
import { selectedBlocks, normalizeBlocks } from '../core/blocks';

let lastColor: { field: 'textColor' | 'backgroundColor'; color: string } | undefined;
export function rememberColor(field: 'textColor' | 'backgroundColor', color: string) {
  lastColor = { field, color };
}

export const NotionShortcuts = createExtension(({ editor }) => {
  const selected = () =>
    selectedBlocks(
      editor.document,
      (editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]).map((block) => block.id),
    );
  const transform = (type: string, props = {}) => {
    if (!editor.isEditable) return false;
    const blocks = selected();
    if (blocks.some((block) => !['inline', 'plain'].includes(editor.schema.blockSchema[block.type]?.content))) return false;
    editor.transact(() => {
      for (const block of blocks) editor.updateBlock(block as any, { type, props });
    });
    return true;
  };
  return {
    key: 'notion-local-shortcuts',
    runsBefore: [
      'quote-block-shortcuts',
      'heading-shortcuts',
      'bullet-list-item-shortcuts',
      'numbered-list-item-shortcuts',
      'check-list-item-shortcuts',
      'toggle-list-item-shortcuts',
    ],
    inputRules: [{ find: /^>\s$/, replace: () => ({ type: 'toggleListItem' }) }],
    keyboardShortcuts: {
      'Mod-Shift-h': () => {
        if (!editor.isEditable || !lastColor) return false;
        const { field, color } = lastColor;
        if (editor.getSelectedText()) editor.addStyles({ [field]: color });
        else
          editor.transact(() => {
            for (const block of selected()) editor.updateBlock(block as any, { props: { [field]: color } });
          });
        return true;
      },
      'Mod-d': () => {
        if (!editor.isEditable) return false;
        const blocks = selected(),
          copies = normalizeBlocks(structuredClone(blocks), true);
        editor.insertBlocks(copies as any, blocks.at(-1)!.id!, 'after');
        editor.setTextCursorPosition(copies[0].id!, 'end');
        return true;
      },
      'Mod-Alt-0': () => transform('paragraph'),
      'Mod-Alt-1': () => transform('heading', { level: 1 }),
      'Mod-Alt-2': () => transform('heading', { level: 2 }),
      'Mod-Alt-3': () => transform('heading', { level: 3 }),
      'Mod-Alt-4': () => transform('checkListItem', { checked: false }),
      'Mod-Alt-5': () => transform('bulletListItem'),
      'Mod-Alt-6': () => transform('numberedListItem'),
      'Mod-Alt-7': () => transform('toggleListItem'),
      'Mod-Alt-8': () => transform('codeBlock'),
      'Mod-Alt-9': () => transform('quote'),
      'Mod-Enter': () => {
        if (!editor.isEditable) return false;
        const block = editor.getTextCursorPosition().block;
        if (block.type === 'checkListItem') {
          editor.updateBlock(block, { props: { checked: !block.props.checked } });
          return true;
        }
        return false;
      },
    },
  };
});
