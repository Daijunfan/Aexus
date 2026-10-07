import type { JsonBlock } from '../types';

const serialized = new WeakMap<JsonBlock[], string>();
/** Immutable block trees retain their computed link-search text across title,
 * navigation and unrelated-page edits. Weak keys release old editor versions. */
export function blockSource(blocks: JsonBlock[]): string {
  let value = serialized.get(blocks);
  if (value === undefined) { value = JSON.stringify(blocks); serialized.set(blocks, value); }
  return value;
}
