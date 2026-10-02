import { useId, type CSSProperties, type ReactNode } from 'react';
import { useWorkspace } from '../store';
import { MathValue } from '../content/Math';
import { PageIcon } from '../ui';
import { plainText } from '../model';
import type { JsonBlock } from '../types';

export function BlockPreview({
  blocks,
  onToggle,
  seenSources = [],
}: {
  blocks: JsonBlock[];
  onToggle?: (path: number[], checked: boolean) => void;
  seenSources?: string[];
}) {
  const { workspace, navigate, command } = useWorkspace();
  const prefix = useId();
  const styles = (props: Record<string, unknown> = {}): CSSProperties => ({
    color: props.textColor && props.textColor !== 'default' ? `var(--content-${props.textColor}-text)` : undefined,
    backgroundColor: props.backgroundColor && props.backgroundColor !== 'default' ? `var(--content-${props.backgroundColor}-background)` : undefined,
    textAlign: props.textAlignment as CSSProperties['textAlign'],
  });
  const openLink = (href: string) => {
    if (href.startsWith('mininotion://page/')) navigate(href.slice('mininotion://page/'.length));
    else void window.native?.openExternal(href);
  };
  const inline = (value: any): ReactNode => {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return value?.content ? inline(value.content) : null;
    return value.map((item, index) => {
      if (typeof item === 'string') return item;
      if (item.type === 'inlineMath') return <MathValue key={index} expression={item.props?.expression || ''} />;
      if (item.type === 'pageMention') {
        const page = workspace!.pages.find((p) => p.id === item.props.pageId && !p.trashedAt);
        return (
          <button key={index} className="page-mention" onClick={() => page && navigate(page.id)}>
            <PageIcon icon={page?.icon} size={14} />
            {page?.title || '已删除页面'}
          </button>
        );
      }
      if (item.type === 'link')
        return (
          <button className="preview-link" key={index} onClick={() => openLink(item.href)}>
            {inline(item.content)}
          </button>
        );
      const formatting = item.styles || {};
      return (
        <span
          key={index}
          style={{
            ...styles(formatting),
            fontWeight: formatting.bold ? 650 : undefined,
            fontStyle: formatting.italic ? 'italic' : undefined,
            textDecoration:
              [formatting.underline && 'underline', formatting.strike && 'line-through']
                .filter(Boolean)
                .join(' ') || undefined,
          }}
          className={formatting.code ? 'preview-code-inline' : undefined}
        >
          {item.text || ''}
        </span>
      );
    });
  };
  const headings: { path: number[]; text: string; level: number }[] = [];
  const collect = (items: JsonBlock[], path: number[] = []) =>
    items.forEach((block, i) => {
      const here = [...path, i];
      if (block.type === 'heading')
        headings.push({ path: here, text: plainText(block.content), level: Number(block.props?.level || 1) });
      if (block.children) collect(block.children, here);
    });
  collect(blocks);
  const render = (items: JsonBlock[], path: number[] = []): ReactNode => {
    let number = 0;
    return items.map((block, index) => {
      const here = [...path, index];
      const props = block.props || {};
      const content = inline(block.content);
      number = block.type === 'numberedListItem' ? (props.start ? Number(props.start) : number + 1) : 0;
      const children = block.children?.length ? render(block.children, here) : null;
      let result: ReactNode;
      switch (block.type) {
        case 'button':
          return (
            <div key={block.id} className="preview-button">
              ↗ {String(block.props?.label || '按钮')}
            </div>
          );
        case 'syncedBlock': {
          const source = workspace!.pages.find(
            (page) => page.id === props.sourceId && page.syncedSource && !page.trashedAt,
          );
          result =
            source && !seenSources.includes(source.id) ? (
              <BlockPreview
                blocks={source.blocks}
                seenSources={[...seenSources, source.id]}
                onToggle={
                  onToggle && !source.locked
                    ? (path, checked) => {
                        let block = source.blocks[path[0]];
                        for (const index of path.slice(1)) block = block.children![index];
                        command('block.update', { pageId: source.id, blockId: block.id, props: { checked } });
                      }
                    : undefined
                }
              />
            ) : (
              <p className="muted">同步内容不可用</p>
            );
          break;
        }
        case 'heading': {
          const level = Number(props.level || 1);
          result = level === 1 ? <h2>{content}</h2> : level === 2 ? <h3>{content}</h3> : <h4>{content}</h4>;
          break;
        }
        case 'bulletListItem':
        case 'numberedListItem':
          result = (
            <div className="preview-list-row">
              <span>{block.type === 'bulletListItem' ? '•' : `${number}.`}</span>
              <div>
                {content}
                {children}
              </div>
            </div>
          );
          break;
        case 'checkListItem':
          result = (
            <div className={`preview-list-row ${props.checked ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={!!props.checked}
                aria-label={plainText(block.content) || '待办'}
                disabled={!onToggle}
                onChange={(e) => onToggle?.(here, e.target.checked)}
              />
              <div>
                {content}
                {children}
              </div>
            </div>
          );
          break;
        case 'toggleListItem':
          result = (
            <details className="preview-toggle">
              <summary>{content}</summary>
              {children}
            </details>
          );
          break;
        case 'quote':
          result = <blockquote>{content}</blockquote>;
          break;
        case 'bookmark':
          result = <button className="preview-bookmark" onClick={() => openLink(String(props.url || ''))}>{String(props.title || props.url || '网页书签')}</button>;
          break;
        case 'breadcrumb':
          result = <span className="muted">页面路径</span>;
          break;
        case 'equation':
          result = <MathValue expression={String(props.expression || '')} display />;
          break;
        case 'callout':
          result = (
            <aside className="preview-callout">
              {props.emoji !== '' && <PageIcon icon={String(props.emoji ?? '💡')} size={20} />}
              <div>{content}</div>
            </aside>
          );
          break;
        case 'divider':
          result = <hr />;
          break;
        case 'codeBlock':
          result = (
            <div className="preview-code">
              <span>{String(props.language || 'text')}</span>
              <pre>{plainText(block.content)}</pre>
            </div>
          );
          break;
        case 'image':
          result = props.url ? (
            <figure>
              <img
                src={String(props.url)}
                alt={String(props.caption || props.name || '图片')}
                loading="lazy"
              />
              {!!props.caption && <figcaption>{String(props.caption)}</figcaption>}
            </figure>
          ) : (
            <div className="muted">图片</div>
          );
          break;
        case 'video':
          result = props.url ? <video src={String(props.url)} controls preload="metadata" /> : null;
          break;
        case 'audio':
          result = props.url ? <audio src={String(props.url)} controls preload="metadata" /> : null;
          break;
        case 'file':
          result = (
            <button className="preview-file" onClick={() => openLink(String(props.url || ''))}>
              ↗ {String(props.name || '附件')}
            </button>
          );
          break;
        case 'pageLink':
        case 'databaseView': {
          const page = workspace!.pages.find(
            (p) => p.id === (props.pageId || props.databaseId) && !p.trashedAt,
          );
          result = (
            <button className="page-link-block" onClick={() => page && navigate(page.id)}>
              <PageIcon icon={page?.icon} />
              <span>{page?.title || '已删除页面'}</span>
            </button>
          );
          break;
        }
        case 'table':
          result = (
            <div className="preview-table-scroll">
              <table>
                {block.content?.rows?.map((row: any, i: number) => (
                  <tbody key={i}>
                    <tr>
                      {row.cells.map((cell: any, j: number) => (
                        <td key={j}>{inline(cell?.content || cell)}</td>
                      ))}
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          );
          break;
        case 'columnList':
          result = <div className="preview-columns">{children}</div>;
          break;
        case 'column':
          result = children;
          break;
        case 'tableOfContents':
          result = (
            <div className="table-of-contents">
              {headings.map((heading) => (
                <button
                  key={heading.path.join('-')}
                  style={{ paddingLeft: (heading.level - 1) * 12 }}
                  onClick={() =>
                    document
                      .getElementById(`${prefix}-${heading.path.join('-')}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                >
                  {heading.text || '无标题'}
                </button>
              ))}
            </div>
          );
          break;
        default:
          result = <p>{content || <br />}</p>;
      }
      return (
        <div
          className={`preview-block preview-${block.type}`}
          key={block.id || index}
          id={`${prefix}-${here.join('-')}`}
          style={{ ...styles(props), ...(block.type === 'column' ? { flex: Number(props.width) || 1 } : {}) }}
        >
          {result}
          {children &&
            ![
              'column',
              'columnList',
              'toggleListItem',
              'bulletListItem',
              'numberedListItem',
              'checkListItem',
            ].includes(block.type) && <div className="preview-nested">{children}</div>}
        </div>
      );
    });
  };
  return <div className="blocks-preview">{render(blocks)}</div>;
}
