import type { Workspace, PersonValue, Page } from '../types.ts';
import { CommandError, requiredString } from '../core/errors.ts';
import { workspacePeople } from './propertySchema.ts';
export function executePersonCommand(workspace: Workspace, method: string, params: Record<string, any>) {
  if (!method.startsWith('person.')) return null;
  const people = workspacePeople(workspace);
  if (method === 'person.list') return { workspace, result: people, changed: false };
  const old = people.find((person) => person.id === params.id);
  if (method !== 'person.create' && !old) throw new CommandError('PERSON_NOT_FOUND', '未找到本地人员');
  if (method === 'person.delete') {
    if (params.id === 'local') throw new CommandError('LOCAL_PERSON', '当前本地作者不能删除');
    return {
      workspace: { ...workspace, people: workspace.people?.filter((person) => person.id !== params.id) },
      result: { deleted: params.id },
      changed: true,
    };
  }
  if (!['person.create', 'person.update'].includes(method))
    throw new CommandError('METHOD_NOT_FOUND', '未知人员方法');
  const person: PersonValue = {
    kind: 'person',
    id: old?.id || crypto.randomUUID(),
    name: requiredString(params.name ?? old?.name, 'name'),
    email: String(params.email ?? old?.email ?? ''),
  };
  const replace = (value: PersonValue | undefined) => (value?.id === person.id ? person : value);
  const pages = workspace.pages.map((page) => {
    const columns = workspace.pages.find((owner) => owner.id === page.parentId)?.database?.columns || [];
    const values = { ...page.values };
    for (const column of columns)
      if (column.type === 'person' && Array.isArray(values[column.id]))
        values[column.id] = (values[column.id] as PersonValue[]).map((value) => replace(value)!);
    return {
      ...page,
      values,
      ...(page.createdBy ? { createdBy: replace(page.createdBy) } : {}),
      ...(page.editedBy ? { editedBy: replace(page.editedBy) } : {}),
    } as Page;
  });
  const next = {
    ...workspace,
    pages,
    ...(person.id === 'local'
      ? { settings: { ...workspace.settings, authorName: person.name, authorEmail: person.email } }
      : {
          people: old
            ? (workspace.people || []).map((value) => (value.id === person.id ? person : value))
            : [...(workspace.people || []), person],
        }),
  };
  return { workspace: next, result: person, changed: true };
}
