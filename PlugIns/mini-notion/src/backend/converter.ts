import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { BlockNoteSchema } from '@blocknote/core';
import { withMultiColumn } from '@blocknote/xl-multi-column';
import type { JsonBlock } from '../types';

// The same BlockNote parser and multi-column schema as the desktop editor.
// App-specific blocks are converted by portableBlocks before serialization.
const editor = ServerBlockNoteEditor.create({
  schema: withMultiColumn(BlockNoteSchema.create()),
  links: { isValidLink: (href) => /^(https?:|mailto:|asset:|mininotion:|file:|#)/i.test(href) },
});
export async function parseDocument(content: string, type: string): Promise<JsonBlock[]> {
  return type === 'html' || type === 'htm'
    ? editor.tryParseHTMLToBlocks(content)
    : editor.tryParseMarkdownToBlocks(content);
}
export async function serializeDocument(blocks: JsonBlock[], type: string) {
  return type === 'md' ? editor.blocksToMarkdownLossy(blocks as any) : editor.blocksToFullHTML(blocks as any);
}
