import type { Workspace } from '../types.ts';
import { isTemplatePage } from '../model.ts';
import { CommandError } from '../core/errors.ts';
import { firstCursor, previousOccurrence, repeatOccurrences } from '../scheduling/recurrence.ts';
import { appendRun, runActions, type Dispatcher } from './engine.ts';
import type { ActionRun } from './types.ts';
export function runScheduledAutomations(
  workspace: Workspace,
  now: number,
  dispatch: Dispatcher,
  prepare: (before: Workspace, after: Workspace) => Workspace = (_, after) => after,
) {
  let candidate = workspace;
  const clocks = { ...workspace.automationClocks };
  const runs: ActionRun[] = [];
  for (const owner of workspace.pages.filter(
    (page) => page.database && !page.trashedAt && !isTemplatePage(page, workspace.pages),
  ))
    for (const rule of owner.database!.automations || []) {
      if (!rule.enabled || !rule.schedule?.enabled) continue;
      const schedule = rule.schedule,
        previous = clocks[rule.id] || { cursor: firstCursor(schedule) },
        latest = previousOccurrence(schedule, now);
      if (latest === null || latest <= previous.cursor) continue;
      const due =
        schedule.catchUp === 'all'
          ? repeatOccurrences(schedule, previous.cursor, 100, now)
          : schedule.catchUp === 'skip' && now - latest >= 60000
            ? []
            : [latest];
      let progress = { ...previous };
      try {
        for (const at of due) {
          if (owner.locked) throw new CommandError('PAGE_LOCKED', '数据库已锁定');
          const result = runActions(
            candidate,
            rule.actions,
            { pageId: owner.id, ownerId: owner.id, automationId: rule.id, now, triggeredAt: at },
            dispatch,
          );
          const run: ActionRun = {
            id: crypto.randomUUID(),
            at: now,
            kind: 'automation',
            name: rule.name,
            ownerId: owner.id,
            sourceId: owner.id,
            status: 'success',
            steps: result.steps,
            scheduledFor: new Date(at).toISOString(),
          };
          candidate = appendRun(prepare(candidate, result.workspace), run);
          runs.push(run);
          progress = { cursor: at };
        }
        if (!due.length) progress = { cursor: latest };
        clocks[rule.id] = progress;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (progress.error !== message) {
          progress = { ...progress, error: message };
          const run: ActionRun = {
            id: crypto.randomUUID(),
            at: now,
            kind: 'automation',
            name: rule.name,
            ownerId: owner.id,
            sourceId: owner.id,
            status: 'error',
            error: message,
          };
          candidate = appendRun(candidate, run);
          runs.push(run);
        }
        clocks[rule.id] = progress;
      }
    }
  const changed =
    candidate !== workspace || JSON.stringify(clocks) !== JSON.stringify(workspace.automationClocks || {});
  return { workspace: changed ? { ...candidate, automationClocks: clocks } : workspace, changed, runs };
}
