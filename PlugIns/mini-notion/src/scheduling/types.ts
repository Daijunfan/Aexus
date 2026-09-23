export type RepeatRule = {
  id: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  startDate: string;
  time: string;
  timeZone: string;
  weekdays?: number[];
  endDate?: string;
  monthMode?: 'day' | 'lastDay' | 'nthWeekday';
  monthDay?: number;
  ordinal?: number;
  weekday?: number;
  catchUp: 'latest' | 'all' | 'skip';
  dateProperty?: string;
  includeTime?: boolean;
  durationMinutes?: number;
  dateOffsetDays?: number;
  shiftDates?: boolean;
  titlePattern?: string;
};
export type Reminder = {
  id: string;
  enabled: boolean;
  text?: string;
  at?: string;
  propertyId?: string;
  offset?: number;
  unit?: 'minutes' | 'days';
  dayTime?: string;
  timeZone?: string;
  deletedAt?: number | null;
};
export type InboxItem = {
  id: string;
  pageId: string;
  kind?: 'reminder' | 'automation';
  automationId?: string;
  reminderId?: string;
  reminderKey?: string;
  title: string;
  text: string;
  scheduledFor: string;
  createdAt: number;
  readAt?: number | null;
  archivedAt?: number | null;
};
export type RepeatRun = {
  id: string;
  templateId: string;
  scheduledFor: string;
  createdAt: number;
  pageId: string;
  title: string;
  manual?: boolean;
};
export type SchedulerState = {
  repeats: Record<
    string,
    { cursor: number; lastRunAt?: number; lastPageId?: string; generated?: number; error?: string }
  >;
  reminders: Record<string, { key: string; deliveredAt?: number; snoozedUntil?: string }>;
  runs: RepeatRun[];
};
