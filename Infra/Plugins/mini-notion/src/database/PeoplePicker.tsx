import { useState } from 'react';
import { Plus, Settings2, UserRound, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { Popover, MenuItem, IconButton } from '../ui';
import { workspacePeople } from './propertySchema';
import type { PersonValue } from '../types';
export function PersonBadge({ person }: { person: PersonValue }) {
  return (
    <span className="person-badge">
      <span className="person-avatar">{person.name.slice(0, 1)}</span>
      {person.name}
    </span>
  );
}
export function PeoplePicker({
  value,
  onChange,
  label,
  disabled = false,
  single = false,
}: {
  value: unknown;
  onChange: (value: PersonValue[]) => void;
  label: string;
  disabled?: boolean;
  single?: boolean;
}) {
  const { workspace, command, api, notify } = useWorkspace();
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null),
    [query, setQuery] = useState(''),
    [managing, setManaging] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [email, setEmail] = useState('');
  const selected = Array.isArray(value) ? (value as PersonValue[]) : [],
    people = workspacePeople(workspace!);
  const edit = (person?: PersonValue) => {
    setEditing(person?.id || 'new');
    setName(person?.name || query);
    setEmail(person?.email || '');
  };
  const invoke = (method: string, params: Record<string, unknown>) =>
    window.native ? api(method, params) : Promise.resolve(command(method, params));
  const save = async () => {
    try {
      const person = (await invoke(editing === 'new' ? 'person.create' : 'person.update', {
        id: editing,
        name,
        email,
      })) as PersonValue;
      if (editing === 'new') onChange(single ? [person] : [...selected, person]);
      setEditing(null);
      setQuery('');
    } catch (error) {
      notify(String(error));
    }
  };
  return (
    <>
      <button
        type="button"
        className="people-property"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPicker({ x: rect.left, y: rect.bottom + 4 });
          setQuery('');
          setManaging(false);
          setEditing(null);
        }}
      >
        {selected.length ? (
          selected.map((person) => <PersonBadge key={person.id} person={person} />)
        ) : (
          <span className="property-empty">
            <UserRound size={14} /> 空
          </span>
        )}
      </button>
      {picker && (
        <Popover {...picker} width={320} className="people-picker" onClose={() => setPicker(null)}>
          {editing ? (
            <div className="person-editor">
              <strong>{editing === 'new' ? '添加本地人员' : '编辑本地人员'}</strong>
              <input
                aria-label="人员姓名"
                placeholder="姓名"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                aria-label="人员邮箱"
                placeholder="邮箱（可选）"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setEditing(null)}>
                  返回
                </button>
                <button type="button" className="primary-button" disabled={!name.trim()} onClick={save}>
                  保存人员
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                className="menu-search"
                placeholder="搜索人员…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {people
                .filter((person) =>
                  `${person.name} ${person.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                )
                .map((person) => (
                  <div className="person-choice" key={person.id}>
                    <MenuItem
                      checked={selected.some((value) => value.id === person.id)}
                      onClick={() =>
                        managing
                          ? edit(person)
                          : onChange(
                              selected.some((value) => value.id === person.id)
                                ? selected.filter((value) => value.id !== person.id)
                                : single
                                  ? [person]
                                  : [...selected, person],
                            )
                      }
                    >
                      <PersonBadge person={person} />
                    </MenuItem>
                    {managing && person.id !== 'local' && (
                      <IconButton
                        label={`移除人员 ${person.name}`}
                        onClick={() => {
                          try {
                            void invoke('person.delete', { id: person.id }).catch((error) =>
                              notify(String(error)),
                            );
                          } catch (error) {
                            notify(String(error));
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    )}
                  </div>
                ))}
              <MenuItem icon={<Plus size={14} />} onClick={() => edit()}>
                添加本地人员
              </MenuItem>
              <div className="menu-divider" />
              <MenuItem icon={<Settings2 size={14} />} onClick={() => setManaging(!managing)}>
                {managing ? '返回选择' : '管理人员'}
              </MenuItem>
              <small className="person-local-hint">仅用于本机笔记署名和任务分配。</small>
            </>
          )}
        </Popover>
      )}
    </>
  );
}
