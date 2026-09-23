import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { IconButton } from '../ui';

export function FindBar({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const ranges = useRef<Range[]>([]);
  useEffect(() => {
    const css = CSS as any;
    ranges.current = [];
    const root =
      document.querySelector('.peek-scroll .bn-editor') || document.querySelector('.page-scroll .bn-editor');
    if (query && root) {
      for (const block of root.querySelectorAll('.bn-inline-content')) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const nodes: { node: Node; start: number; end: number }[] = [];
        let text = '';
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const start = text.length;
          text += node.textContent || '';
          nodes.push({ node, start, end: text.length });
        }
        text = text.toLocaleLowerCase();
        const needle = query.toLocaleLowerCase();
        let from = 0;
        for (let at = text.indexOf(needle, from); at !== -1; at = text.indexOf(needle, from)) {
          const start = nodes.find((node) => node.start <= at && node.end > at)!;
          const end = nodes.find((node) => node.start < at + query.length && node.end >= at + query.length)!;
          const range = document.createRange();
          range.setStart(start.node, at - start.start);
          range.setEnd(end.node, at + query.length - end.start);
          ranges.current.push(range);
          from = at + needle.length;
        }
      }
    }
    setCount(ranges.current.length);
    setIndex(0);
    if (css.highlights) {
      const Highlight = (window as any).Highlight;
      css.highlights.set('search-results', new Highlight(...ranges.current));
    }
    return () => {
      css.highlights?.delete('search-results');
      css.highlights?.delete('search-current');
    };
  }, [query]);
  useEffect(() => {
    const range = ranges.current[index];
    if (range) {
      range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (CSS as any).highlights?.set('search-current', new (window as any).Highlight(range));
    }
  }, [index, count]);
  const step = (direction: number) => setIndex((i) => (count ? (i + direction + count) % count : 0));
  return (
    <div className="find-bar">
      <input
        aria-label="在页面中查找"
        autoFocus
        placeholder="在页面中查找…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span>
        {count ? index + 1 : 0}/{count}
      </span>
      <IconButton label="上一个匹配" onClick={() => step(-1)}>
        <ChevronUp size={16} />
      </IconButton>
      <IconButton label="下一个匹配" onClick={() => step(1)}>
        <ChevronDown size={16} />
      </IconButton>
      <IconButton label="关闭查找" onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
