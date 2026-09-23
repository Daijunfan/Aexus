import type { Page, JsonBlock } from '../types.ts';
import type { ButtonConfig, DatabaseAutomation } from './types.ts';
export function copyActions(
  config: ButtonConfig,
  pages: Page[],
  mapping: Map<string, string>,
  databaseId: string | undefined,
  rewriteBlocks: (blocks: JsonBlock[]) => void,
): ButtonConfig {
  let createdDatabase: string | undefined;
  const actions = config.actions.map((source) => {
    const action = structuredClone(source);
    action.id = crypto.randomUUID();
    const targetDatabase = ['create', 'edit'].includes(action.type)
      ? action.databaseId
      : action.target === 'created'
        ? createdDatabase
        : action.target && action.target !== 'current'
          ? pages.find((page) => page.id === action.target)?.parentId || undefined
          : databaseId;
    const columns = pages.find((page) => page.id === targetDatabase)?.database?.columns || [];
    for (const [id, value] of Object.entries(action.values || {}))
      if (columns.find((column) => column.id === id)?.type === 'relation') {
        if (Array.isArray(value))
          action.values![id] = value.map((value) =>
            typeof value === 'string' ? mapping.get(value) || value : value,
          );
        else if (typeof value === 'string') action.values![id] = mapping.get(value) || value;
      }
    if (action.type === 'create') createdDatabase = action.databaseId;
    for (const key of ['target', 'databaseId', 'templateId'] as const)
      if (action[key] && mapping.has(action[key]!)) action[key] = mapping.get(action[key]!);
    if (action.blocks) rewriteBlocks(action.blocks);
    return action;
  });
  return { ...config, actions };
}
export function copyAutomations(
  rules: DatabaseAutomation[],
  pages: Page[],
  mapping: Map<string, string>,
  databaseId: string,
  rewriteBlocks: (blocks: JsonBlock[]) => void,
) {
  return rules.map((rule) => ({
    ...rule,
    id: crypto.randomUUID(),
    enabled: false,
    actions: copyActions(rule, pages, mapping, databaseId, rewriteBlocks).actions,
    schedule: rule.schedule ? { ...rule.schedule, id: crypto.randomUUID() } : undefined,
  }));
}
