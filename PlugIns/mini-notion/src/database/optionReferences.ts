import type { Workspace, FilterGroup } from '../types.ts';
import type { ActionStep } from '../actions/types.ts';
import { flattenBlocks } from '../core/blocks.ts';

// Option names are the public values in existing workspaces; keep their saved uses aligned on rename.
export function renameOptionReferences(
  workspace: Workspace,
  databaseId: string,
  propertyId: string,
  renames: Record<string, string> = {},
) {
  if (!Object.keys(renames).length) return workspace;
  const next = structuredClone(workspace);
  const value = (input: unknown): unknown =>
    typeof input === 'string' && Object.hasOwn(renames, input)
      ? renames[input]
      : Array.isArray(input)
        ? input.map(value)
        : input;
  const filters = (group: FilterGroup | undefined) => {
    for (const rule of group?.rules || [])
      if ('rules' in rule) filters(rule);
      else if (rule.property === propertyId) rule.value = value(rule.value) as string;
  };
  const actions = (steps: ActionStep[], currentDatabase?: string | null) => {
    let createdDatabase: string | undefined;
    for (const step of steps) {
      const target = ['create', 'edit'].includes(step.type)
        ? step.databaseId
        : step.target === 'created'
          ? createdDatabase
          : step.target && step.target !== 'current'
            ? next.pages.find((page) => page.id === step.target)?.parentId
            : currentDatabase;
      if (target === databaseId) {
        if (step.values && Object.hasOwn(step.values, propertyId))
          step.values[propertyId] = value(step.values[propertyId]);
        filters(step.filters);
      }
      if (step.type === 'create') createdDatabase = step.databaseId;
    }
  };
  for (const page of next.pages) {
    if (page.database) {
      if (page.id === databaseId) for (const view of page.database.views || []) filters(view.filters);
      for (const column of page.database.columns) if (column.button) actions(column.button.actions, page.id);
      for (const rule of page.database.automations || []) {
        if (page.id === databaseId) filters(rule.filters);
        actions(rule.actions, page.id);
      }
    }
    for (const { block } of flattenBlocks(page.blocks)) {
      if (block.type === 'button' && block.props?.actions) {
        const steps = JSON.parse(String(block.props.actions));
        actions(steps, page.parentId);
        block.props.actions = JSON.stringify(steps);
      }
      if (block.type === 'databaseView' && block.props?.databaseId === databaseId && block.props.viewState) {
        const state = JSON.parse(String(block.props.viewState));
        for (const view of state.views || []) filters(view.filters);
        block.props.viewState = JSON.stringify(state);
      }
    }
  }
  return next;
}
