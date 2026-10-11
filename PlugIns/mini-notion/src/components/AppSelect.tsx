import { useEffect, useLayoutEffect, useRef, useState, useId, type KeyboardEvent, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { surfacePosition } from '../presentation';

type Choice = { value: string; label: string; disabled: boolean };
/** The native select owns form values; its visible control shares the menu geometry. */
export function AppSelect({ children, className = '', onChange, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId(), [choices, setChoices] = useState<Choice[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 180, maxWidth: 180, maxHeight: 280 });
  useLayoutEffect(() => { setChoices(Array.from(native.current?.options ?? []).map(option => ({ value: option.value, label: option.textContent?.trim() || option.value, disabled: option.disabled }))); }, [children, props.value]);
  const value = String(props.value ?? native.current?.value ?? ''), selected = choices.find(choice => choice.value === value);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current!.getBoundingClientRect();
      const next = surfacePosition(box.left, box.bottom + 5, Math.max(box.width, 180), menu.current?.offsetHeight || 280, { width: innerWidth, height: innerHeight }, box.top - 5);
      next.maxHeight = Math.min(280, next.maxHeight);
      setPosition(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    place();
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    const observer = new ResizeObserver(place); observer.observe(menu.current!);
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, choices.length]);
  useEffect(() => { if (open) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  const show = () => { if (!props.disabled) { setActive(Math.max(0, choices.findIndex(choice => choice.value === value))); setOpen(true); } };
  const choose = (choice?: Choice) => {
    if (!choice || choice.disabled) return;
    native.current!.value = choice.value;
    native.current!.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false); trigger.current?.focus({ preventScroll: true });
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (!choices.length) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); if (!open) { show(); return; }
      const step = event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1;
      let next = event.key === 'Home' ? -1 : event.key === 'End' ? choices.length : active;
      for (let i = 0; i < choices.length; i++) { next = (next + step + choices.length) % choices.length; if (!choices[next].disabled) break; }
      setActive(next); return;
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(choices[active]); else show(); }
  };
  return <span className={`app-select ${className}`}>
    <select {...props} ref={native} className="app-select-native" tabIndex={-1} aria-hidden="true" onChange={onChange}>{children}</select>
    <button ref={trigger} type="button" className="app-select-trigger" disabled={props.disabled} title={props.title} aria-label={props['aria-label']} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-expanded={open} onClick={() => open ? setOpen(false) : show()} onKeyDown={key}><span>{selected?.label || '请选择'}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={id} className="app-select-menu" role="listbox" aria-label={props['aria-label']} style={position} onKeyDown={key}>{choices.map((choice, index) => <button type="button" role="option" aria-selected={choice.value === value} key={`${choice.value}-${index}`} className={index === active ? 'active' : ''} disabled={choice.disabled} onPointerEnter={() => setActive(index)} onClick={() => choose(choice)}><span>{choice.label}</span><Check size={14} aria-hidden="true" style={{ visibility: choice.value === value ? 'visible' : 'hidden' }} /></button>)}</div>, document.body)}
  </span>;
}
