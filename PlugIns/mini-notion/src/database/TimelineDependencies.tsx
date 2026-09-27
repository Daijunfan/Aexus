import { useEffect, useId, useState, type RefObject } from 'react';
import { useWorkspace } from '../store';
import { MenuItem, Popover } from '../ui';
import type { Page } from '../types';

type Connection = { from: string; x: number; y: number } | null;
type Edge = { from: string; to: string; title: string; path: string; overlap: boolean };
export function TimelineDependencies({
  container,
  rows,
  refresh,
  connection,
  readOnly = false,
}: {
  container: RefObject<HTMLDivElement | null>;
  rows: Page[];
  refresh: unknown;
  connection: Connection;
  readOnly?: boolean;
}) {
  const { command, notify } = useWorkspace();
  const marker = useId().replaceAll(':', '');
  const [edges, setEdges] = useState<Edge[]>([]);
  const [drawing, setDrawing] = useState('');
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const measure = () => {
      const grid = container.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const labelWidth = grid.querySelector('.timeline-name-header')!.getBoundingClientRect().width;
      const bars = new Map(
        Array.from(grid.querySelectorAll<HTMLElement>('[data-timeline-id]')).map((bar) => [
          bar.dataset.timelineId!,
          bar.getBoundingClientRect(),
        ]),
      );
      const next: Edge[] = [];
      for (const row of rows)
        for (const from of row.blockedBy || []) {
          const a = bars.get(from),
            b = bars.get(row.id);
          if (!a || !b) continue;
          const x1 = a.right - rect.left - labelWidth,
            y1 = a.top + a.height / 2 - rect.top;
          const x2 = b.left - rect.left - labelWidth,
            y2 = b.top + b.height / 2 - rect.top;
          next.push({
            from,
            to: row.id,
            title: `${rows.find((row) => row.id === from)?.title || '无标题'} → ${row.title || '无标题'}`,
            overlap: x1 >= x2,
            path: `M${x1} ${y1} H${x1 + 12} V${(y1 + y2) / 2} H${x2 - 12} V${y2} H${x2 - 3}`,
          });
        }
      setEdges(next);
      setSize({ width: grid.offsetWidth - labelWidth, height: grid.offsetHeight });
      const origin = connection && bars.get(connection.from);
      setDrawing(
        origin && connection
          ? `M${origin.right - rect.left - labelWidth} ${origin.top + origin.height / 2 - rect.top} L${connection.x - rect.left - labelWidth} ${connection.y - rect.top}`
          : '',
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [container, rows, refresh, connection]);
  const remove = (edge: Edge) => {
    if (readOnly) return;
    try {
      command('dependency.remove', { pageId: edge.to, predecessorId: edge.from });
    } catch (error) {
      notify(String(error));
    }
  };
  return (
    <svg className="timeline-dependencies" width={size.width} height={size.height} aria-label="任务依赖关系">
      <defs>
        <marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0 0 L7 3.5 L0 7Z" fill="context-stroke" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={`${edge.from}-${edge.to}`}
          className={`dependency-edge ${edge.overlap ? 'overlap' : ''}`}
          d={edge.path}
          markerEnd={`url(#${marker})`}
          role="button"
          tabIndex={readOnly ? -1 : 0}
          aria-disabled={readOnly}
          aria-label={`移除依赖 ${edge.title}`}
          onClick={() => remove(edge)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              remove(edge);
            }
          }}
        >
          <title>{edge.title} · 点击移除依赖</title>
        </path>
      ))}
      {drawing && <path className="dependency-drawing" d={drawing} markerEnd={`url(#${marker})`} />}
    </svg>
  );
}
export function DependencyHandle({
  row,
  rows,
  onConnection,
}: {
  row: Page;
  rows: Page[];
  onConnection: (connection: Connection) => void;
}) {
  const { command, notify } = useWorkspace();
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [moved, setMoved] = useState(false);
  const add = (id: string) => {
    try {
      command('dependency.add', { pageId: id, predecessorId: row.id });
      setPicker(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <>
      <button
        className="dependency-handle"
        aria-label={`从 ${row.title || '无标题'} 创建依赖`}
        disabled={row.locked}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setOrigin({ x: event.clientX, y: event.clientY });
          setMoved(false);
        }}
        onPointerMove={(event) => {
          if (!origin) return;
          if (Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) > 4) {
            setMoved(true);
            onConnection({ from: row.id, x: event.clientX, y: event.clientY });
          }
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (moved) {
            const target = document
              .elementsFromPoint(event.clientX, event.clientY)
              .map((element) => element.closest<HTMLElement>('[data-timeline-id]'))
              .find(Boolean);
            if (target?.dataset.timelineId && target.dataset.timelineId !== row.id)
              add(target.dataset.timelineId);
          }
          event.currentTarget.releasePointerCapture(event.pointerId);
          setOrigin(null);
          onConnection(null);
        }}
        onLostPointerCapture={() => {
          setOrigin(null);
          onConnection(null);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (!moved) {
            const rect = event.currentTarget.getBoundingClientRect();
            setPicker({ x: rect.left, y: rect.bottom + 4 });
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            setPicker(null);
            onConnection(null);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setPicker({ x: rect.left, y: rect.bottom + 4 });
          }
        }}
      >
        ●
      </button>
      {picker && (
        <Popover {...picker} width={310} onClose={() => setPicker(null)}>
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="picker-heading">选择后续任务</div>
            {rows
              .filter((target) => target.id !== row.id && !target.locked)
              .map((target) => (
                <MenuItem key={target.id} onClick={() => add(target.id)}>
                  {target.title || '无标题'}
                </MenuItem>
              ))}
          </div>
        </Popover>
      )}
    </>
  );
}
