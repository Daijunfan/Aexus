import { Bell, CalendarDays, CheckCheck, CircleAlert, Clock3, ListTodo, Repeat2, UserRound, Zap } from 'lucide-react';
import { PageIcon } from '../ui';
import type { EventInfo, EventTone } from '../scheduling/presentation';

export function EventState({ children, tone = 'neutral' }: { children: string; tone?: EventTone }) {
  const Icon = tone === 'done' ? CheckCheck : tone === 'warning' ? CircleAlert : Clock3;
  return <span className={`event-state tone-${tone}`}><Icon size={11} aria-hidden="true" />{children}</span>;
}
export function EventIndicators({ repeat, reminders }: { repeat: string; reminders: number }) {
  return <>{repeat && <span className="event-repeat" title={repeat}><Repeat2 size={12} aria-hidden="true" /><span>{repeat}</span></span>}
    {reminders > 0 && <span className="event-reminder" title={`${reminders} 个已启用的提醒`}><Bell size={12} aria-hidden="true" /><span>提醒{reminders > 1 ? ` ${reminders}` : ''}</span></span>}</>;
}
/** Content only: the enclosing view owns click, drag, completion and exact geometry. */
export function EventSummary({ info, detailed = false, showWhen = true, kind = 'record' }: {
  info: EventInfo; detailed?: boolean; showWhen?: boolean; kind?: 'record' | 'reminder' | 'todo' | 'automation';
}) {
  const Icon = kind === 'reminder' ? Bell : kind === 'todo' ? ListTodo : kind === 'automation' ? Zap : null;
  return <span className={`event-summary ${detailed ? 'detailed' : ''}`} data-event-kind={kind} data-event-state={info.tone}>
    <span className="event-heading">{Icon ? <Icon size={14} aria-hidden="true" /> : <PageIcon icon={info.icon} size={14} />}
      <strong className="event-title">{info.title}</strong></span>
    {showWhen && <span className="event-time" title={info.fullWhen}>
      {info.when.includes('全天') ? <CalendarDays size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}
      <span>{detailed ? info.fullWhen : info.when}</span></span>}
    <span className="event-meta"><EventState tone={info.tone}>{info.status}</EventState>
      <EventIndicators repeat={info.repeat} reminders={info.reminders} />
      {detailed && info.owner && <span className="event-owner"><UserRound size={11} aria-hidden="true" />{info.owner}</span>}</span>
  </span>;
}
