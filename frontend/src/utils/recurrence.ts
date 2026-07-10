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

export type RichRecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom_interval';

export interface RichRecurrenceConfig {
    type: RichRecurrenceType;
    weeklyDay: string;   // '0' (Sun) .. '6' (Sat) — fallback single day
    weeklyDays?: string[]; // list of days, e.g. ['1', '3', '5'] (Mon, Wed, Fri)
    monthlyDay: string;  // '1'..'31' — used when type === 'monthly'
    customIntervalDays?: number; // used when type === 'custom_interval'
    count: number;       // number of occurrences, clamped 1..24
    endDate?: string;    // YYYY-MM-DD end date bound
}

export const RICH_RECURRENCE_OPTIONS: { value: RichRecurrenceType; label: string }[] = [
    { value: 'none', label: 'One-off / None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly Once' },
    { value: 'custom_interval', label: 'Custom Day Interval' },
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
    type: 'none', weeklyDay: '1', weeklyDays: ['1'], monthlyDay: '1', customIntervalDays: 3, count: 4, endDate: ''
};

/**
 * Expand a rich recurrence config into concrete dates.
 *  - none:    [startDate]
 *  - daily:   `count` consecutive days from startDate
 *  - weekly:  next occurrence of any `weeklyDays`, then every 7 days, `count` times
 *  - biweekly: next occurrence of any `weeklyDays`, every 14 days, `count` times
 *  - monthly: `monthlyDay` of each month (clamped to the month's last day), `count` times
 *  - custom_interval: every N days, `count` times
 * Stop if any date is after `endDate`. Count is clamped to 1..24.
 */
export function richRecurrenceDates(startDate: Date, config: RichRecurrenceConfig): Date[] {
    const dates: Date[] = [];
    const count = Math.min(Math.max(Math.floor(config.count) || 1, 1), 24);
    const current = new Date(startDate);
    const end = config.endDate ? new Date(config.endDate + 'T23:59:59') : null;

    const isAfterEnd = (d: Date) => {
        if (!end) return false;
        return d.getTime() > end.getTime();
    };

    if (config.type === 'daily') {
        for (let i = 0; i < count; i++) {
            const temp = new Date(startDate);
            temp.setDate(temp.getDate() + i);
            if (isAfterEnd(temp)) break;
            dates.push(temp);
        }
    } else if (config.type === 'weekly') {
        const daysSet = new Set((config.weeklyDays && config.weeklyDays.length > 0) ? config.weeklyDays.map(Number) : [parseInt(config.weeklyDay || '1', 10)]);
        let current = new Date(startDate);
        let found = 0;
        let protection = 0;
        while (found < count && protection < 365) {
            if (daysSet.has(current.getDay())) {
                const temp = new Date(current);
                if (isAfterEnd(temp)) break;
                dates.push(temp);
                found++;
            }
            current.setDate(current.getDate() + 1);
            protection++;
        }
    } else if (config.type === 'biweekly') {
        const daysSet = new Set((config.weeklyDays && config.weeklyDays.length > 0) ? config.weeklyDays.map(Number) : [parseInt(config.weeklyDay || '1', 10)]);
        
        const getStartOfWeek = (d: Date) => {
            const temp = new Date(d);
            const day = temp.getDay();
            temp.setDate(temp.getDate() - day);
            temp.setHours(0,0,0,0);
            return temp;
        };
        
        const baseWeekStart = getStartOfWeek(startDate);
        let current = new Date(startDate);
        let found = 0;
        let protection = 0;
        while (found < count && protection < 365) {
            if (daysSet.has(current.getDay())) {
                const currentWeekStart = getStartOfWeek(current);
                const diffTime = Math.abs(currentWeekStart.getTime() - baseWeekStart.getTime());
                const diffWeeks = Math.round(diffTime / (7 * 24 * 60 * 60 * 1000));
                if (diffWeeks % 2 === 0) {
                    const temp = new Date(current);
                    if (isAfterEnd(temp)) break;
                    dates.push(temp);
                    found++;
                }
            }
            current.setDate(current.getDate() + 1);
            protection++;
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
            if (isAfterEnd(temp)) break;
            dates.push(temp);
        }
    } else if (config.type === 'custom_interval') {
        const interval = Math.max(config.customIntervalDays || 1, 1);
        for (let i = 0; i < count; i++) {
            const temp = new Date(startDate);
            temp.setDate(temp.getDate() + (i * interval));
            if (isAfterEnd(temp)) break;
            dates.push(temp);
        }
    } else {
        if (!isAfterEnd(startDate)) {
            dates.push(startDate);
        }
    }
    return dates;
}
