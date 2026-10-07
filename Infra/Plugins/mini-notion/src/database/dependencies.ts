import type { Database, Page, Workspace } from '../types.ts';
import { isTemplatePage } from '../model.ts';
import { addDays, dateKey, parseDay, scheduledRange, moveScheduledRecord } from './dates.ts';
import { CommandError } from '../core/errors.ts';

type Configuration = NonNullable<Database['dependencies']>;
function range(page: Page | undefined, config: Configuration) {
  if (!page) return null;
  const scheduled = scheduledRange(page, config.dateProperty, config.endProperty);
  const start = parseDay(scheduled.start);
  if (!start) return null;
  const end = parseDay(scheduled.end) || start;
  return { start, end: end < start ? start : end };
}
const difference = (after: Date, before: Date) => Math.round((after.getTime() - before.getTime()) / 86400000);
const weekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

// The caller validates the dependency DAG before applying its scheduling rules.
export function applyDependencyShifts(before: Workspace, candidate: Workspace): Workspace {
  const previous = new Map(before.pages.map((page) => [page.id, page]));
  const current = new Map(candidate.pages.map((page) => [page.id, page]));
  let changedAny = false;
  for (const database of candidate.pages.filter(
    (page) => page.database?.dependencies?.enabled && !page.trashedAt,
  )) {
    const config = database.database!.dependencies!;
    if (config.shift === 'none') continue;
    const inTemplate = isTemplatePage(database, candidate.pages);
    const rows = candidate.pages.filter(
      (page) =>
        page.parentId === database.id &&
        !page.trashedAt &&
        !page.templateFor &&
        (inTemplate || !isTemplatePage(page, candidate.pages)),
    );
    const rowIds = new Set(rows.map((page) => page.id));
    const configChanged =
      JSON.stringify(previous.get(database.id)?.database?.dependencies) !== JSON.stringify(config);
    const changed = new Set<string>();
    const manuallyChanged = new Set<string>();
    for (const row of rows) {
      const old = range(previous.get(row.id), config),
        next = range(row, config);
      if (JSON.stringify(old) !== JSON.stringify(next) || previous.get(row.id)?.trashedAt !== row.trashedAt) {
        changed.add(row.id);
        if (previous.has(row.id)) manuallyChanged.add(row.id);
      }
    }
    const ordered: Page[] = [],
      visited = new Set<string>();
    const visit = (page: Page) => {
      if (visited.has(page.id)) return;
      for (const id of page.blockedBy || []) if (rowIds.has(id)) visit(current.get(id)!);
      visited.add(page.id);
      ordered.push(page);
    };
    rows.forEach(visit);
    for (const original of ordered) {
      const page = current.get(original.id)!;
      const period = range(page, config);
      const dependencies = (page.blockedBy || []).filter(
        (id) => rowIds.has(id) && range(current.get(id), config),
      );
      if (!period || !dependencies.length) continue;
      const oldPage = previous.get(page.id),
        oldRange = range(oldPage, config);
      const linksChanged = JSON.stringify(oldPage?.blockedBy || []) !== JSON.stringify(page.blockedBy || []);
      if (
        !configChanged &&
        !linksChanged &&
        !dependencies.some((id) => changed.has(id)) &&
        !(config.shift === 'overlap' && changed.has(page.id))
      )
        continue;
      if (config.shift === 'maintain' && manuallyChanged.has(page.id) && !configChanged && !linksChanged)
        continue;
      let start = new Date(period.start);
      if (config.shift === 'maintain' && oldRange && !linksChanged && !configChanged) {
        const candidates = dependencies.map((id) => {
          const old = range(previous.get(id), config),
            next = range(current.get(id), config)!;
          return old ? addDays(next.end, difference(oldRange.start, old.end)) : period.start;
        });
        start = new Date(Math.max(...candidates.map((date) => date.getTime())));
      } else {
        const earliest = Math.max(
          ...dependencies.map((id) => addDays(range(current.get(id), config)!.end, 1).getTime()),
        );
        if (start.getTime() < earliest) start = new Date(earliest);
      }
      if (dateKey(start) === dateKey(period.start)) continue;
      if (page.locked)
        throw new CommandError(
          'DEPENDENT_LOCKED',
          `「${page.title || '无标题'}」已锁定，无法自动调整依赖日期`,
        );
      let end = addDays(start, difference(period.end, period.start));
      if (config.avoidWeekends) {
        while (weekend(start) || weekend(end)) {
          start = addDays(start, 1);
          end = addDays(end, 1);
        }
      }
      current.set(page.id, {
        ...page,
        values: moveScheduledRecord(page, config.dateProperty, config.endProperty, dateKey(start)),
        updatedAt: Date.now(),
      });
      changed.add(page.id);
      changedAny = true;
    }
  }
  return changedAny
    ? { ...candidate, pages: candidate.pages.map((page) => current.get(page.id)!) }
    : candidate;
}
