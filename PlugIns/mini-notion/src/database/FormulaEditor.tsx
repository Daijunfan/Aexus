import { useRef, useState, type CSSProperties } from 'react';
import { Check, CircleAlert, Code2, Search } from 'lucide-react';
import { Modal, PageIcon } from '../ui';
import { useWorkspace } from '../store';
import { computeProperty } from './propertiesModel';
import { formulaFunctions, validateFormula, type FormulaValue } from './formula';
import type { Page, Property } from '../types';

const foreground: Record<string, string> = {
  gray: '#91918e',
  brown: '#9f806a',
  orange: '#d98f45',
  yellow: '#b59b45',
  green: '#5a9270',
  blue: '#4289bf',
  purple: '#9975b4',
  pink: '#bb7799',
  red: '#cc6764',
};
export function FormulaResult({ value }: { value: FormulaValue }) {
  const { workspace, navigate } = useWorkspace();
  if (value === null) return <span className="muted">空</span>;
  if (typeof value === 'boolean') return <span className="formula-checkbox">{value ? '☑' : '☐'}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span>{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <span className="formula-list">
        {value.map((item, i) => (
          <span key={i}>
            {i > 0 && <span className="muted">, </span>}
            <FormulaResult value={item} />
          </span>
        ))}
      </span>
    );
  if (value instanceof Date)
    return (
      <span>
        {value.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          ...(value.getHours() || value.getMinutes() ? { hour: '2-digit', minute: '2-digit' } : {}),
        })}
      </span>
    );
  if (value.kind === 'page') {
    const page = workspace!.pages.find((p) => p.id === value.id);
    return (
      <button className="relation-link" onClick={() => navigate(value.id)}>
        <PageIcon icon={page?.icon} size={13} />
        {page?.title || '无标题'}
      </button>
    );
  }
  if (value.kind === 'person') return <span>{value.name}</span>;
  if (value.kind === 'dateRange')
    return (
      <span>
        <FormulaResult value={value.start} /> → <FormulaResult value={value.end} />
      </span>
    );
  const style: CSSProperties = {};
  for (const token of value.styles) {
    if (foreground[token]) style.color = foreground[token];
    else if (token.endsWith('_background') && foreground[token.slice(0, -11)])
      style.backgroundColor = foreground[token.slice(0, -11)] + '25';
    else if (token === 'b') style.fontWeight = 650;
    else if (token === 'i') style.fontStyle = 'italic';
    else if (token === 'u') style.textDecoration = `${style.textDecoration || ''} underline`;
    else if (token === 's') style.textDecoration = `${style.textDecoration || ''} line-through`;
    else if (token === 'c') {
      style.fontFamily = 'Menlo, monospace';
      style.backgroundColor = 'var(--hover)';
      style.padding = '1px 4px';
      style.borderRadius = 3;
    }
  }
  const content = value.parts
    ? value.parts.map((part, i) => <FormulaResult key={i} value={part} />)
    : value.text;
  return value.href ? (
    <button
      className="formula-link"
      style={style}
      onClick={() => {
        if (value.href!.startsWith('mininotion://page/'))
          navigate(value.href!.slice('mininotion://page/'.length));
        else void window.native?.openExternal(value.href!);
      }}
    >
      {content}
    </button>
  ) : (
    <span style={style}>{content}</span>
  );
}

export function FormulaEditor({
  page,
  column,
  onSave,
  onClose,
}: {
  page: Page;
  column: Property;
  onSave: (expression: string) => void;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [expression, setExpression] = useState(column.formula || '');
  const [query, setQuery] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const source = {
    ...page,
    database: {
      ...page.database!,
      columns: page.database!.columns.some((c) => c.id === column.id)
        ? page.database!.columns.map((c) => (c.id === column.id ? { ...column, formula: expression } : c))
        : [...page.database!.columns, { ...column, formula: expression }],
    },
  };
  const pages = workspace!.pages.map((p) => (p.id === page.id ? source : p));
  const records = pages.filter((p) => p.parentId === page.id && !p.trashedAt).slice(0, 5);
  const preview = records.map((record) => ({
    record,
    result: computeProperty(record, { ...column, type: 'formula', formula: expression }, pages),
  }));
  const syntaxError = validateFormula(expression);
  const error = syntaxError
    ? { ok: false as const, error: syntaxError }
    : preview.find((p) => !p.result.ok)?.result;
  const insert = (value: string) => {
    const start = textarea.current?.selectionStart ?? expression.length,
      end = textarea.current?.selectionEnd ?? expression.length;
    setExpression(expression.slice(0, start) + value + expression.slice(end));
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + value.length, start + value.length);
    });
  };
  return (
    <Modal title={`编辑公式 · ${column.name || '新公式'}`} wide className="formula-modal" onClose={onClose}>
      <div className="formula-editor-layout">
        <div className="formula-main">
          <div className="formula-code-heading">
            <Code2 size={15} />
            <span>公式</span>
            <kbd>⌘ Enter 保存</kbd>
          </div>
          <textarea
            ref={textarea}
            autoFocus
            aria-label="公式表达式"
            className="formula-code-input"
            spellCheck={false}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder={'if(prop("状态") == "已完成", "✅", "⏳")'}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSave(expression);
                onClose();
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                insert('  ');
              }
            }}
          />
          <div className={`formula-validity ${error && !error.ok ? 'invalid' : ''}`}>
            {error && !error.ok ? (
              <>
                <CircleAlert size={14} />
                {error.error}
              </>
            ) : (
              <>
                <Check size={14} />
                {expression.trim() ? '公式有效' : '输入公式以查看结果'}
              </>
            )}
          </div>
          <div className="formula-preview">
            <h4>结果预览</h4>
            {preview.length ? (
              preview.map(({ record, result }) => (
                <div className="formula-preview-row" key={record.id}>
                  <span>
                    <PageIcon icon={record.icon} size={14} />
                    {record.title || '无标题'}
                  </span>
                  <div>
                    {result.ok ? (
                      <FormulaResult value={result.value} />
                    ) : (
                      <span className="formula-error">{result.error}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">添加数据库记录后将在这里显示计算结果。</p>
            )}
          </div>
          <div className="formula-help-line">
            支持属性引用、数值、文本、日期、列表、关联页面、变量和点调用语法。
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => {
                onSave(expression);
                onClose();
              }}
            >
              保存公式
            </button>
          </div>
        </div>
        <aside className="formula-reference">
          <div className="formula-reference-search">
            <Search size={14} />
            <input
              aria-label="搜索公式函数"
              placeholder="搜索属性和函数…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <h4>属性</h4>
          {[{ id: 'title', name: '名称' }, ...page.database!.columns]
            .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
            .map((c) => (
              <button key={c.id} onClick={() => insert(`prop(${JSON.stringify(c.name)})`)}>
                <span>▧</span>
                {c.name}
              </button>
            ))}
          <h4>函数</h4>
          {formulaFunctions
            .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
            .map((name) => (
              <button key={name} onClick={() => insert(`${name}()`)}>
                <span>ƒ</span>
                {name}
              </button>
            ))}
        </aside>
      </div>
    </Modal>
  );
}
