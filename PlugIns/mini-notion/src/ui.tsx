import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { File, X, Check, ChevronRight, icons } from 'lucide-react';
import { useContext } from 'react';
import { AppearanceTheme } from './appearance';
import { parseIcon, iconColors } from './core/icons';

export function IconButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  children: ReactNode;
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function PageIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const theme = useContext(AppearanceTheme);
  const glyph = parseIcon(icon);
  if (glyph) {
    const Glyph = icons[glyph.name as keyof typeof icons];
    return <Glyph size={size} strokeWidth={1.8} className="page-symbol" style={{ color: iconColors[glyph.color][theme] }} aria-hidden="true" />;
  }
  if (icon && /^(asset:|https?:\/\/|data:image\/)/i.test(icon))
    return <img className="page-image-icon" src={icon} width={size} height={size} alt="" draggable={false} />;
  return icon ? (
    <span className="page-emoji" style={{ fontSize: size }}>
      {icon}
    </span>
  ) : (
    <File size={size} strokeWidth={1.5} className="page-default-icon" aria-hidden="true" />
  );
}
export function MenuItem({
  children,
  icon,
  shortcut,
  onClick,
  danger = false,
  checked,
  submenu,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  submenu?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${danger ? 'danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{children}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
      {checked && <Check size={15} />}
      {submenu && <ChevronRight size={14} />}
    </button>
  );
}
export function Popover({
  x,
  y,
  onClose,
  children,
  width = 260,
  className = '',
  role = 'menu',
  label,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  role?: 'menu' | 'dialog';
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      const layers = document.querySelectorAll('.popover-layer');
      if (event.key === 'Escape' && ref.current?.parentElement === layers[layers.length - 1]) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', dismiss, true);
    return () => window.removeEventListener('keydown', dismiss, true);
  }, [onClose]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const place = () => {
      const rect = ref.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(ref.current);
    window.addEventListener('resize', place);
    const input = ref.current.querySelector<HTMLElement>('input, button');
    input?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [x, y]);
  return createPortal(
    <div
      className="popover-layer"
      onMouseDown={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (
          role === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
          !(e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
        ) {
          e.preventDefault();
          const items = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [],
          );
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-label={label}
        className={`popover ${className}`}
        style={{ ...position, width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const frame = requestAnimationFrame(() =>
      (
        ref.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select') ||
        ref.current?.querySelector<HTMLElement>('button') ||
        ref.current
      )?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
        if (e.key === 'Tab') {
          const controls = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]',
            ) || [],
          ).filter((el) => el.getClientRects().length);
          if (e.shiftKey && document.activeElement === controls[0]) {
            e.preventDefault();
            controls.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === controls.at(-1)) {
            e.preventDefault();
            controls[0]?.focus();
          }
        }
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={index}
        href={part}
        onClick={(event) => {
          if (window.native) {
            event.preventDefault();
            void window.native.openExternal(part);
          }
        }}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export const formatDate = (time: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
export function relativeDate(time: number) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} 天前`;
  return new Date(time).toLocaleDateString('zh-CN');
}
