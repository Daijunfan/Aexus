import { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';
import { Sigma } from 'lucide-react';
import { Popover } from '../ui';

export function MathValue({ expression, display = false }: { expression: string; display?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(expression, {
        displayMode: display,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxSize: 20,
      }),
    [expression, display],
  );
  return <span className="math-value" aria-label={expression} dangerouslySetInnerHTML={{ __html: html }} />;
}
function MathInput({
  value,
  display,
  onChange,
  readOnly,
}: {
  value: string;
  display: boolean;
  onChange: (expression: string) => void;
  readOnly: boolean;
}) {
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState(value);
  const apply = () => {
    onChange(draft);
    setPopup(null);
  };
  return (
    <span onMouseDownCapture={event => event.stopPropagation()} className={display ? 'equation-block' : 'inline-equation'} contentEditable={false}>
      <button
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className="equation-value"
        disabled={readOnly}
        aria-label={display ? '编辑块公式' : '编辑行内公式'}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setDraft(value);
          setPopup({ x: rect.left, y: rect.bottom + 5 });
        }}
      >
        {value ? (
          <MathValue expression={value} display={display} />
        ) : (
          <span className="equation-placeholder">
            <Sigma size={18} />
            添加公式
          </span>
        )}
      </button>
      {popup && (
        <Popover
          {...popup}
          width={400}
          role="dialog"
          label="编辑数学公式"
          className="equation-popover"
          onClose={() => setPopup(null)}
        >
          <div className="picker-heading">数学公式</div>
          <textarea
            autoFocus
            aria-label="LaTeX 公式"
            value={draft}
            placeholder={'E = mc^2'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                apply();
              }
            }}
          />
          <div className="equation-preview">
            <MathValue expression={draft} display={display} />
          </div>
          <footer>
            <span>LaTeX · Shift + Enter 换行</span>
            <button className="primary-button" onClick={apply}>
              完成
            </button>
          </footer>
        </Popover>
      )}
    </span>
  );
}
export const Equation = createReactBlockSpec(
  { type: 'equation', propSchema: { ...defaultProps, expression: { default: '' } }, content: 'none' },
  {
    meta: { selectable: false },
    render: ({ block, editor }) => (
      <MathInput
        display
        value={block.props.expression}
        readOnly={!editor.isEditable}
        onChange={(expression) => editor.updateBlock(block, { props: { expression } })}
      />
    ),
    toExternalHTML: ({ block }) => (
      <div data-mini-equation={block.props.expression}>
        <MathValue expression={block.props.expression} display />
      </div>
    ),
    parse: (element) =>
      element.hasAttribute('data-mini-equation')
        ? { expression: element.getAttribute('data-mini-equation') || '' }
        : undefined,
  },
);
export const InlineMath = createReactInlineContentSpec(
  { type: 'inlineMath', propSchema: { expression: { default: '' } }, content: 'none' },
  {
    render: ({ inlineContent, editor, updateInlineContent }) => (
      <MathInput
        display={false}
        value={inlineContent.props.expression}
        readOnly={!editor.isEditable}
        onChange={(expression) => updateInlineContent({ type: 'inlineMath', props: { expression } })}
      />
    ),
    toExternalHTML: ({ inlineContent }) => (
      <span data-mini-inline-equation={inlineContent.props.expression}>
        <MathValue expression={inlineContent.props.expression} />
      </span>
    ),
    parse: (element) =>
      element.hasAttribute('data-mini-inline-equation')
        ? { expression: element.getAttribute('data-mini-inline-equation') || '' }
        : undefined,
  },
);
