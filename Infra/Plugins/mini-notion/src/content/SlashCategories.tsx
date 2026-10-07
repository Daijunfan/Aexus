import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { SuggestionMenuController, type DefaultReactSuggestionItem, type SuggestionMenuProps } from '@blocknote/react';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from '../ui';
import type { SlashCategory } from '../types';

type SlashItem = DefaultReactSuggestionItem & { empty?: boolean };
type MenuProps = SuggestionMenuProps<SlashItem> & {
  categories: SlashCategory[]; active: string; choose: (id: string) => void;
  reorder: (categories: SlashCategory[]) => void; manage: () => void;
};

function CategoryMenu({ items, selectedIndex, onItemClick, categories, active, choose, reorder, manage }: MenuProps) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selectedIndex]);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start || Math.abs(event.clientX - start.x) < 6 && !start.moved) return;
    start.moved = true;
    const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLElement>('[data-category]'));
    const target = tabs.find(tab => { const r = tab.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right; });
    const from = categories.findIndex(c => c.id === start.id), to = categories.findIndex(c => c.id === target?.dataset.category);
    if (to < 0 || from === to) return;
    const next = [...categories]; next.splice(to, 0, next.splice(from, 1)[0]); reorder(next);
  };
  return <div id="bn-suggestion-menu" className="bn-suggestion-menu slash-category-menu">
    <div className="slash-category-tabs" role="tablist" aria-label="斜杠命令分类">
      <button role="tab" aria-selected={active === 'all'} onClick={() => choose('all')}>全部</button>
      {categories.map(category => <button key={category.id} role="tab" data-category={category.id}
        aria-selected={active === category.id} title="左右拖动可调整分类顺序"
        onPointerDown={event => { drag.current = { id: category.id, x: event.clientX, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onClick={() => choose(category.id)}>{category.name}</button>)}
      <button aria-label="管理命令分类" title="添加、编辑或删除分类" onClick={manage}><Settings2 size={16} /></button>
    </div>
    <div ref={list} className="slash-category-items" role="listbox" aria-label="斜杠命令">
      {items.map((item, index) => <button key={item.title} id={`bn-suggestion-menu-item-${index}`}
        role="option" aria-selected={selectedIndex === index} disabled={item.empty}
        onClick={() => onItemClick?.(item)}><span className="slash-item-icon">{item.icon}</span>
        <span><strong>{item.title}</strong>{item.subtext && <small>{item.subtext}</small>}</span></button>)}
    </div>
  </div>;
}

export function CategorizedSlashMenu({ items }: { items: DefaultReactSuggestionItem[] }) {
  const { workspace, setting } = useWorkspace();
  const groupOf = (item: DefaultReactSuggestionItem) => ['数据库', '媒体', '颜色', '操作'].includes(item.group || '') ? item.group :
    ['高级块', '高级功能', '其他', '行内'].includes(item.group || '') ? '高级块' : '基本块';
  const defaults = ['基本块', '数据库', '媒体', '高级块', '颜色', '操作'].map(group => ({
    id: group, name: group, commands: items.filter(item => groupOf(item) === group).map(item => item.title),
  }));
  const categories = workspace!.settings.slashCategories || defaults;
  const [active, setActive] = useState('all');
  const [editing, setEditing] = useState<SlashCategory[] | null>(null);
  const [editId, setEditId] = useState('');
  const getItems = useCallback(async (query: string): Promise<SlashItem[]> => {
    // Typed searches span every category; tabs narrow the bare slash menu.
    const commands = categories.find(c => c.id === active)?.commands;
    const filtered = filterSuggestionItems(query || active === 'all' ? items : items.filter(item => commands?.includes(item.title)), query);
    return filtered.length ? filtered : [{ title: '此分类暂无命令', subtext: '在分类管理中选择命令', empty: true, onItemClick: () => {} }];
  }, [items, active, workspace!.settings.slashCategories]);
  const menuState = useRef({ categories, active, setActive, setting, setEditing, setEditId });
  menuState.current = { categories, active, setActive, setting, setEditing, setEditId };
  // Keep component identity stable when a tab or preference changes.
  const [Menu] = useState(() => (props: SuggestionMenuProps<SlashItem>) => {
    const s = menuState.current;
    return <CategoryMenu {...props} categories={s.categories} active={s.active} choose={s.setActive}
      reorder={next => s.setting({ slashCategories: next })}
      manage={() => { s.setEditing(s.categories); s.setEditId(s.categories[0]?.id || ''); }} />;
  });
  const selected = editing?.find(category => category.id === editId);
  const change = (changes: Partial<SlashCategory>) => setEditing(editing!.map(c => c.id === editId ? { ...c, ...changes } : c));
  return <>
    <SuggestionMenuController key={active} triggerCharacter="/" getItems={getItems} suggestionMenuComponent={Menu} />
    {editing && <Modal title="管理命令分类" onClose={() => setEditing(null)} className="slash-category-editor">
      <div className="slash-category-edit-tabs">
        {editing.map(c => <button key={c.id} className={c.id === editId ? 'active' : ''} onClick={() => setEditId(c.id)}>{c.name}</button>)}
        <button onClick={() => { const c = { id: crypto.randomUUID(), name: '新分类', commands: [] }; setEditing([...editing, c]); setEditId(c.id); }}><Plus size={14} />添加分类</button>
      </div>
      {selected && <>
        <label>分类名称<input aria-label="分类名称" value={selected.name} onChange={e => change({ name: e.target.value })} /></label>
        <p>选择要放入此分类的命令。一个命令可属于多个分类。</p>
        <div className="slash-category-choices">{items.map(item => <label key={item.title}>
          <input type="checkbox" checked={selected.commands.includes(item.title)} onChange={e => change({ commands: e.target.checked ? [...selected.commands, item.title] : selected.commands.filter(c => c !== item.title) })} />{item.title}
        </label>)}</div>
        <button className="danger" onClick={() => { const next = editing.filter(c => c.id !== editId); setEditing(next); setEditId(next[0]?.id || ''); }}><Trash2 size={14} />删除分类</button>
      </>}
      <div className="modal-actions"><button onClick={() => setEditing(null)}>取消</button><button className="primary"
        disabled={editing.some(c => !c.name.trim())} onClick={() => { setting({ slashCategories: editing.map(c => ({ ...c, name: c.name.trim() })) }); if (!editing.some(c => c.id === active)) setActive('all'); setEditing(null); }}>保存分类</button></div>
    </Modal>}
  </>;
}
