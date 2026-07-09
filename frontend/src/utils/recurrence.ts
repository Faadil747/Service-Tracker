import { addDays, addWeeks, addMonths } from 'date-fns';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
    { value: 'none', label: 'Does not repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

/**
 * Expand a recurrence into concrete dates starting from `base`.
 * Returns `[base]` for 'none'. Count is clamped to 1..24.
 */
export function recurrenceDates(base: Date, type: RecurrenceType, count: number): Date[] {
    if (type === 'none') return [base];
    const n = Math.min(Math.max(Math.floor(count) || 1, 1), 24);
    const out: Date[] = [];
    for (let i = 0; i < n; i++) {
        if (type === 'daily') out.push(addDays(base, i));
        else if (type === 'weekly') out.push(addWeeks(base, i));
        else if (type === 'monthly') out.push(addMonths(base, i));
        else out.push(base);
    }
    return out;
}

// ── Rich recurrence ─────────────────────────────────────────────────────────
// The richer model used by the Content Calendar and Task Workspace: on top of a
// plain count it lets you pin a specific weekday (weekly) or day-of-month
// (monthly). Kept identical across both surfaces so recurring tasks/posts behave
// the same wherever they are created.

export type RichRecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface RichRecurrenceConfig {
    type: RichRecurrenceType;
    weeklyDay: string;   // '0' (Sun) .. '6' (Sat) — used when type === 'weekly'
    monthlyDay: string;  // '1'..'31' — used when type === 'monthly'
    count: number;       // number of occurrences, clamped 1..24
}

export const RICH_RECURRENCE_OPTIONS: { value: RichRecurrenceType; label: string }[] = [
    { value: 'none', label: 'One-off / None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly Once' },
    { value: 'monthly', label: 'Monthly Once' },
];

export const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' },
];

export const DEFAULT_RICH_RECURRENCE: RichRecurrenceConfig = {
    type: 'none', weeklyDay: '1', monthlyDay: '1', count: 4,
};

/**
 * Expand a rich recurrence config into concrete dates.
 *  - none:    [startDate]
 *  - daily:   `count` consecutive days from startDate
 *  - weekly:  next occurrence of `weeklyDay`, then every 7 days, `count` times
 *  - monthly: `monthlyDay` of each month (clamped to the month's last day), `count` times
 * Count is clamped to 1..24.
 */
export function richRecurrenceDates(startDate: Date, config: RichRecurrenceConfig): Date[] {
    const dates: Date[] = [];
    const count = Math.min(Math.max(Math.floor(config.count) || 1, 1), 24);
    const current = new Date(startDate);

    if (config.type === 'daily') {
        for (let i = 0; i < count; i++) {
            const temp = new Date(startDate);
            temp.setDate(temp.getDate() + i);
            dates.push(temp);
        }
    } else if (config.type === 'weekly') {
        const targetDay = parseInt(config.weeklyDay, 10);
        let diff = targetDay - current.getDay();
        if (diff < 0) diff += 7;
        current.setDate(current.getDate() + diff);
        for (let i = 0; i < count; i++) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 7);
        }
    } else if (config.type === 'monthly') {
        const targetDate = parseInt(config.monthlyDay, 10);
        for (let i = 0; i < count; i++) {
            const temp = new Date(current);
            temp.setMonth(temp.getMonth() + i);
            const year = temp.getFullYear();
            const month = temp.getMonth();
            const lastDay = new Date(year, month + 1, 0).getDate();
            temp.setDate(Math.min(targetDate, lastDay));
            dates.push(temp);
        }
    } else {
        dates.push(startDate);
    }
    return dates;
}
