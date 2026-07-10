// User notification preferences — persisted per-browser and honoured by the
// toast layer in App.tsx, so the Settings toggles genuinely turn categories on/off.

export type NotifCategory = 'tasks' | 'posts' | 'deadlines' | 'alerts' | 'engagement';

const KEY = 'notif_prefs_v1';

const DEFAULTS: Record<NotifCategory, boolean> = {
    tasks: true, posts: true, deadlines: true, alerts: true, engagement: true,
};

export const NOTIF_CATEGORIES: { key: NotifCategory; label: string; desc: string }[] = [
    { key: 'tasks', label: 'Task assignments & updates', desc: 'New tasks, claims, completions' },
    { key: 'posts', label: 'Post reviews & approvals', desc: 'Drafts submitted, approved or sent back' },
    { key: 'deadlines', label: 'Missed deadlines', desc: 'Overdue tasks & accountability' },
    { key: 'alerts', label: 'System alerts', desc: 'Warnings and critical alerts' },
    { key: 'engagement', label: 'LinkedIn engagement', desc: 'Engagement milestones' },
];

export function getNotifPrefs(): Record<NotifCategory, boolean> {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* fall back to defaults */ }
    return { ...DEFAULTS };
}

export function setNotifPref(key: NotifCategory, value: boolean): void {
    const prefs = getNotifPrefs();
    prefs[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Map a backend notification `type` string to a preference category.
export function categoryForType(type: string): NotifCategory {
    const t = (type || '').toLowerCase();
    if (t.includes('post') || t.includes('review') || t.includes('draft')) return 'posts';
    if (t.includes('overdue') || t.includes('missed') || t.includes('deadline')) return 'deadlines';
    if (t.includes('alert')) return 'alerts';
    if (t.includes('engagement') || t.includes('linkedin')) return 'engagement';
    return 'tasks'; // task_assigned / task_approved / pending_approval / task_completed / …
}

export function shouldShowToast(type: string): boolean {
    return getNotifPrefs()[categoryForType(type)] !== false;
}
