import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    TrendingUp, Eye, Heart, CheckCircle, Clock,
    AlertTriangle, Search, Plus, X, MessageSquare, CheckSquare, RefreshCw
} from 'lucide-react';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths
} from 'date-fns';
import { metricsApi, tasksApi, usersApi, settingsApi } from '../services/api';
import { richRecurrenceDates, RICH_RECURRENCE_OPTIONS, WEEKDAY_OPTIONS, RichRecurrenceConfig, RichRecurrenceType } from '../utils/recurrence';
import { useAuthStore } from '../store/authStore';
import { Task, User } from '../types';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DateTimePicker } from '../components/shared/DateTimePicker';
import { AnalyticsHubView } from './AnalyticsHubView';
import {
    ResponsiveContainer, AreaChart, Area,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    Cell, ReferenceLine
} from 'recharts';

const TREND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-07-10" -> "Jul 10" so chart X-axes are readable (not "07-10").
const fmtDay = (iso: string) => {
    const p = String(iso || '').split('-');
    if (p.length < 3) return iso;
    return `${TREND_MONTHS[parseInt(p[1], 10) - 1] || ''} ${parseInt(p[2], 10)}`;
};

export const getTaskStatusInfo = (t: Task) => {
    if (t.status === 'completed') {
        return { label: 'Published & Completed', className: 'badge-success', dotClass: 'muted' };
    }
    if (t.post?.status === 'approved') {
        return { label: `Approved (${t.claimed_by_name || 'Agent'})`, className: 'badge-purple', dotClass: 'active' };
    }
    if (t.status === 'pending_approval') {
        return { label: 'Sent for Approval', className: 'badge-warning', dotClass: 'warning' };
    }
    if (t.status === 'in_progress') {
        return { label: `Ongoing (${t.claimed_by_name || 'Agent'})`, className: 'badge-info', dotClass: 'active' };
    }
    if (t.status === 'active') {
        if (t.claimed_by_id) {
            return { label: `Accepted (${t.claimed_by_name || 'Agent'})`, className: 'badge-purple', dotClass: 'active' };
        }
        return { label: 'Open (Unclaimed)', className: 'badge-accent', dotClass: 'active' };
    }
    if (t.status === 'rejected' || t.post?.status === 'rejected') {
        return { label: 'Needs Revision', className: 'badge-danger', dotClass: 'danger' };
    }
    return { label: t.status.replace('_', ' '), className: 'badge-gray', dotClass: 'muted' };
};

// ── Login Popup ────────────────────────────────────────────────────────────
const LoginPopup: React.FC<{ onClose: () => void; user: User; tasks: Task[]; pendingApprovals: Task[] }> = ({ onClose, user, tasks, pendingApprovals }) => {
    // For agents, show their pending tasks (tasks that are not completed and are claimed/assigned to them)
    const agentPendingTasks = tasks.filter(t =>
        t.status !== 'completed' &&
        (t.claimed_by_id === user.id || t.assignments?.some(a => a.agent_id === user.id))
    );

    // For admins, look at due today tasks across all agents
    const dueTodayTasks = tasks.filter(t =>
        t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString() && t.status !== 'completed'
    );

    const allClear = user.role === 'agent'
        ? agentPendingTasks.length === 0
        : dueTodayTasks.length === 0 && pendingApprovals.length === 0;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h3>👋 Welcome back, {user.full_name.split(' ')[0]}!</h3>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
                </div>

                {allClear ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                        <h4 style={{ color: 'var(--success)', marginBottom: 8 }}>Everything is up to date!</h4>
                        <p style={{ color: 'var(--text-muted)' }}>No pending tasks or approvals. Great job!</p>
                    </div>
                ) : (
                    <div>
                        {user.role === 'agent' && agentPendingTasks.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} /> Your Pending Tasks ({agentPendingTasks.length})
                                </div>
                                {agentPendingTasks.map(t => (
                                    <div key={t.id} className="glass-card" style={{ padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <CheckSquare size={14} color="var(--warning)" />
                                        <span style={{ fontSize: '0.875rem', flex: 1 }}>{t.title}</span>
                                        {t.due_date && (
                                            <span className="badge badge-warning">
                                                Due: {new Date(t.due_date).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {user.role === 'admin' && (
                            <>
                                {dueTodayTasks.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <AlertTriangle size={14} /> Overdue / Due Today — Agents
                                        </div>
                                        {dueTodayTasks.slice(0, 5).map(t => (
                                            <div key={t.id} className="glass-card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t.title}</div>
                                                </div>
                                                <button className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
                                                    <MessageSquare size={12} /> Message
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {pendingApprovals.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CheckCircle size={14} /> Pending Approvals ({pendingApprovals.length})
                                        </div>
                                        {pendingApprovals.map(t => (
                                            <div key={t.id} className="glass-card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ flex: 1, fontSize: '0.875rem' }}>{t.title}</span>
                                                <span className="badge badge-purple">Approval Needed</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <button className="btn btn-primary w-full" style={{ marginTop: 20 }} onClick={onClose}>
                    Let's Go →
                </button>
            </div>
        </div>
    );
};

// ── Calendar ───────────────────────────────────────────────────────────────
const CalendarPanel: React.FC<{ tasks: Task[]; onAddTask: (date: Date) => void; onNavigateToTask: (taskId: string) => void }> = ({ tasks, onAddTask, onNavigateToTask }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const getTasksForDay = (day: Date) => tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());
    const statusColor: Record<string, string> = {
        completed: 'var(--success)',
        active: 'var(--accent)',
        in_progress: 'var(--info)',
        pending_approval: 'var(--warning)',
        overdue: 'var(--danger)',
        on_hold: 'var(--text-muted)'
    };

    const selectedDayTasks = getTasksForDay(selectedDate);

    return (
        <div className="chart-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4 style={{ margin: 0 }}>📅 Task Calendar</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>‹</button>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: 110, textAlign: 'center' }}>
                        {format(currentMonth, 'MMMM yyyy')}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>›</button>
                </div>
            </div>

            <div className="calendar-grid" style={{ marginBottom: 4 }}>
                {dayLabels.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
                ))}
            </div>
            <div className="calendar-grid">
                {days.map((day) => {
                    const dayTasks = getTasksForDay(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = day.toDateString() === selectedDate.toDateString();
                    return (
                        <div
                            key={day.toISOString()}
                            className={`calendar-day ${isToday(day) ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}`}
                            onClick={() => setSelectedDate(day)}
                            style={{
                                outline: isSelected ? '2px solid var(--accent)' : undefined,
                                outlineOffset: '-2px',
                                cursor: 'pointer',
                                minHeight: 40,
                                padding: '3px 5px',
                            }}
                            title={dayTasks.map(t => t.title).join(', ')}
                        >
                            <span style={{ fontSize: '0.78rem', fontWeight: isToday(day) || isSelected ? 700 : 400, color: isToday(day) ? 'var(--accent)' : 'var(--text-primary)' }}>
                                {format(day, 'd')}
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                                {dayTasks.slice(0, 3).map(t => (
                                    <div key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[t.status] || 'var(--text-muted)' }} title={t.title} />
                                ))}
                                {dayTasks.length > 3 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+{dayTasks.length - 3}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                {Object.entries(statusColor).map(([s, c]) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                        {s.replace('_', ' ')}
                    </div>
                ))}
            </div>

            {/* Short Tasks Overlay/Panel */}
            <div style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--border)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Tasks for {format(selectedDate, 'MMM d, yyyy')}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => onAddTask(selectedDate)} style={{ padding: '2px 6px', fontSize: '0.72rem', height: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Plus size={11} /> + Add Task
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 104, overflowY: 'auto' }}>
                    {selectedDayTasks.map(t => {
                        const statusInfo = getTaskStatusInfo(t);
                        return (
                            <div
                                key={t.id}
                                onClick={() => onNavigateToTask(t.id)}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '6px 8px', background: '#fff', borderRadius: 6,
                                    borderLeft: `3px solid ${statusColor[t.status] || 'var(--border)'}`,
                                    cursor: 'pointer', transition: 'all 0.12s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-glow)'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                            >
                                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
                                    {t.title}
                                </span>
                                <span className={`badge ${statusInfo.className}`} style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                                    {statusInfo.label}
                                </span>
                            </div>
                        );
                    })}
                    {selectedDayTasks.length === 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                            No tasks scheduled this day
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Main Dashboard ─────────────────────────────────────────────────────────
export const DashboardView: React.FC<{ region: string }> = ({ region }) => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    // Trend window selector. Defaults to a rolling 14 days (the most useful window);
    // Week/Month/Custom become distinct as more daily snapshots accumulate.
    const [trendPeriod, setTrendPeriod] = useState<{ days: number; end: string; label: string }>({ days: 14, end: '', label: '14 Days' });
    const [overview, setOverview] = useState<any>(null);
    const [summary, setSummary] = useState<any>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [pendingApprovals, setPendingApprovals] = useState<Task[]>([]);
    const [agents, setAgents] = useState<User[]>([]);
    const [overdue, setOverdue] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [showPopup, setShowPopup] = useState(() => {
        const key = `popup_dismissed_${new Date().toDateString()}`;
        return !sessionStorage.getItem(key);
    });
    const [loading, setLoading] = useState(true);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        region: 'Global'
    });
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
    const [taskRecurrence, setTaskRecurrence] = useState<RichRecurrenceConfig>({
        type: 'none',
        weeklyDay: '1',
        monthlyDay: '1',
        customIntervalDays: 3,
        count: 4,
        endDate: ''
    });
    const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);
    const [linkedinError, setLinkedinError] = useState<string>('');
    const [followerHistory, setFollowerHistory] = useState<any>(null);
    const [dailyTrend, setDailyTrend] = useState<any>(null);
    const [syncing, setSyncing] = useState(false);
    const isAdmin = user?.role === 'admin';
    const initialLoaded = useRef(false);

    const dismissPopup = () => {
        const key = `popup_dismissed_${new Date().toDateString()}`;
        sessionStorage.setItem(key, '1');
        setShowPopup(false);
    };

    const loadAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // Fetch independently so a failure in one (e.g. summary or tasks)
            // doesn't block the others — LinkedIn analytics must still render.
            const [oRes, sumRes, tRes] = await Promise.allSettled([
                metricsApi.linkedinOverview(),
                metricsApi.dashboardSummary(),
                tasksApi.list({ region: region === 'Global' ? undefined : region }),
            ]);
            if (oRes.status === 'fulfilled') setOverview(oRes.value.data);
            if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
            if (tRes.status === 'fulfilled') setTasks(tRes.value.data);

            // Follower history (our own DB — powers the rolling-window growth cards)
            try {
                const fhRes = await metricsApi.followerHistory(30);
                setFollowerHistory(fhRes.data);
            } catch { /* non-fatal */ }

            if (isAdmin) {
                const [paRes, ovRes, agRes] = await Promise.allSettled([
                    tasksApi.pendingApprovals(),
                    tasksApi.accountability(region === 'Global' ? undefined : region),
                    usersApi.list({ role: 'agent' }),
                ]);
                if (paRes.status === 'fulfilled') setPendingApprovals(paRes.value.data);
                if (ovRes.status === 'fulfilled') setOverdue(ovRes.value.data);
                if (agRes.status === 'fulfilled') setAgents(agRes.value.data);
            }
        } catch (e) { /* silent fail on polls */ }
        if (!silent) setLoading(false);
    }, [region, isAdmin]);

    useEffect(() => {
        // First load: show skeleton
        if (!initialLoaded.current) {
            initialLoaded.current = true;
            loadAll(false);
        } else {
            loadAll(false); // region changed — show skeleton
        }
        // LinkedIn analytics are day-throttled and update at most daily — poll gently.
        const interval = setInterval(() => loadAll(true), 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [region]);

    // Daily trend follows the window selector (rolling 14d by default, or a chosen
    // window / anchor date). Reads our own DB (no LinkedIn call) and polls so it
    // stays realtime as new daily snapshots land; it fills out over time.
    useEffect(() => {
        let alive = true;
        const loadTrend = () => metricsApi.dailyTrend(trendPeriod.days, trendPeriod.end || undefined)
            .then(res => { if (alive) setDailyTrend(res.data); })
            .catch(() => { });
        loadTrend();
        const t = setInterval(loadTrend, 15000);
        return () => { alive = false; clearInterval(t); };
    }, [trendPeriod]);

    // Keep tasks (and therefore the calendar + task panel) realtime as work
    // progresses — a light DB read every 12s so new/updated tasks and their due
    // dates appear on the calendar without waiting for the 5-min full refresh.
    useEffect(() => {
        let alive = true;
        const refreshTasks = async () => {
            try {
                const tRes = await tasksApi.list({ region: region === 'Global' ? undefined : region });
                if (!alive) return;
                setTasks(tRes.data);
                if (isAdmin) {
                    const [pa, ov] = await Promise.allSettled([
                        tasksApi.pendingApprovals(),
                        tasksApi.accountability(region === 'Global' ? undefined : region),
                    ]);
                    if (alive && pa.status === 'fulfilled') setPendingApprovals(pa.value.data);
                    if (alive && ov.status === 'fulfilled') setOverdue(ov.value.data);
                }
            } catch { /* transient */ }
        };
        const t = setInterval(refreshTasks, 12000);
        return () => { alive = false; clearInterval(t); };
    }, [region, isAdmin]);

    // Check LinkedIn connection status (admin only, once)
    useEffect(() => {
        if (!isAdmin) return;
        settingsApi.linkedinStatus()
            .then(r => {
                setLinkedinConnected(r.data.connected);
                if (!r.data.connected) setLinkedinError(r.data.error || 'LinkedIn API not connected');
            })
            .catch(() => {
                setLinkedinConnected(false);
                setLinkedinError('Could not reach LinkedIn API');
            });
    }, [isAdmin]);




    // Manual LinkedIn sync — the ONLY thing that hits the LinkedIn API. Reads are
    // served from cache to protect the daily quota; this button forces a live pull.
    const handleManualSync = async () => {
        setSyncing(true);
        try {
            await metricsApi.syncPage(region === 'Global' ? undefined : region);
            await loadAll(true);
            toast.success('Synced latest data from LinkedIn');
        } catch {
            toast.error('Sync failed — LinkedIn may be rate-limited or the token expired');
        }
        setSyncing(false);
    };

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        try {
            const base = newTask.due_date ? new Date(newTask.due_date) : new Date();
            const dates = richRecurrenceDates(base, taskRecurrence);
            const endVal = taskRecurrence.endDate ? format(new Date(taskRecurrence.endDate), "yyyy-MM-dd'T'23:59:59") : undefined;
            for (const d of dates) {
                await tasksApi.create({
                    title: newTask.title,
                    description: newTask.description,
                    priority: newTask.priority,
                    region: newTask.region,
                    recurrence: taskRecurrence.type,
                    recurrence_end_date: endVal,
                    due_date: newTask.due_date ? format(d, "yyyy-MM-dd'T'HH:mm:ss") : undefined,
                    assigned_to_ids: selectedAgentIds.length > 0 ? selectedAgentIds : undefined
                });
            }
            const many = dates.length > 1;
            toast.success(many
                ? `${isAdmin ? 'Created' : 'Submitted'} ${dates.length} recurring tasks`
                : (isAdmin ? 'Task created!' : 'Task submitted for approval'));
            setShowAddTask(false);
            setNewTask({ title: '', description: '', due_date: '', priority: 'medium', region: 'Global' });
            setSelectedAgentIds([]);
            setTaskRecurrence({ type: 'none', weeklyDay: '1', monthlyDay: '1', customIntervalDays: 3, count: 4, endDate: '' });
            loadAll(true);
        } catch { toast.error('Failed to create task'); }
    };

    const filteredTasks = tasks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()));
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const activeTasks = tasks.filter(t => ['active', 'in_progress'].includes(t.status));

    // Real LinkedIn snapshot values (null when LinkedIn hasn't provided them yet).
    const li = overview || {};
    const meta = li._meta || {};
    const num = (v: any) => (v === null || v === undefined) ? null : Number(v);
    const kFollowers = num(li.followers);
    const kImpressions = num(li.impressions);
    const kReach = num(li.unique_impressions);
    const kClicks = num(li.clicks);
    const kLikes = num(li.likes);
    const kComments = num(li.comments);
    const kEngagement = num(li.engagement_rate);
    const showVal = (v: number | null) => v === null ? '—' : v.toLocaleString();

    if (loading) {
        return (
            <div className="page-content">
                <div className="grid-4" style={{ marginBottom: 16 }}>
                    {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
                </div>
                <div className="grid-2" style={{ marginBottom: 16 }}>
                    {[...Array(2)].map((_, i) => <div key={i} className="skeleton" style={{ height: 280 }} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="page-content animate-fade">
            {/* Combined dashboard header — title + manual Sync (the single control
                that ever calls the LinkedIn API). Trends default to a rolling 14 days. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ marginRight: 'auto' }}>
                    <div className="page-title" style={{ fontSize: '1.4rem', fontWeight: 800 }}>Dashboard</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Live company-page analytics · {trendPeriod.end ? `14 days up to ${trendPeriod.end}` : `last ${trendPeriod.days} days`}{dailyTrend?.snapshot_count ? ` · ${dailyTrend.snapshot_count} day${dailyTrend.snapshot_count !== 1 ? 's' : ''} recorded so far` : ''}
                    </div>
                </div>

                {/* Trend window selector — fills in as daily snapshots accumulate */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                    {[{ d: 14, l: '14 Days' }, { d: 7, l: 'Week' }, { d: 30, l: 'Month' }].map(o => {
                        const active = trendPeriod.label === o.l;
                        return (
                            <button key={o.l} onClick={() => setTrendPeriod({ days: o.d, end: '', label: o.l })} style={{
                                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-muted)', fontFamily: 'inherit',
                            }}>{o.l}</button>
                        );
                    })}
                </div>
                <input
                    type="date"
                    value={trendPeriod.end}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setTrendPeriod({ days: 14, end: e.target.value, label: e.target.value ? 'Custom' : '14 Days' })}
                    title="Pick an end date to view the 14 days up to that date"
                    className="input"
                    style={{ width: 'auto', fontSize: '0.78rem', padding: '5px 8px' }}
                />

                <button
                    onClick={handleManualSync}
                    disabled={syncing}
                    title="Pull the latest data from LinkedIn (the only action that calls the LinkedIn API)"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--accent)', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                        cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1, fontFamily: 'inherit',
                    }}
                >
                    <RefreshCw size={14} style={{ animation: syncing ? 'spin 0.7s linear infinite' : 'none' }} />
                    {syncing ? 'Syncing…' : 'Sync'}
                </button>
            </div>

            {(
                <>
                    {/* Login Popup */}
                    {showPopup && user && (
                        <LoginPopup user={user} tasks={tasks} pendingApprovals={pendingApprovals} onClose={dismissPopup} />
                    )}

                    {/* Add Task Modal */}
                    {showAddTask && (
                        <div className="modal-overlay" onClick={() => setShowAddTask(false)}>
                            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <h3>Create Task</h3>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddTask(false)}><X size={16} /></button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div className="form-group">
                                        <label className="form-label">Task Title *</label>
                                        <input className="input" placeholder="e.g. Write LinkedIn post for Q3" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea className="textarea" placeholder="Task details..." value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} />
                                    </div>
                                    {/* Priority & Region row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TASK PRIORITY</label>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {[
                                                    { value: 'low', label: '🟢 Low', activeColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'var(--success)' },
                                                    { value: 'medium', label: '🟡 Medium', activeColor: 'rgba(234, 179, 8, 0.15)', borderColor: 'var(--warning)' },
                                                    { value: 'high', label: '🔴 High', activeColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'var(--danger)' }
                                                ].map(p => (
                                                    <button
                                                        key={p.value}
                                                        type="button"
                                                        className="btn btn-sm"
                                                        onClick={() => setNewTask(prev => ({ ...prev, priority: p.value }))}
                                                        style={{
                                                            flex: 1,
                                                            fontSize: '0.72rem',
                                                            background: newTask.priority === p.value ? p.activeColor : 'var(--surface)',
                                                            color: newTask.priority === p.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            border: `1px solid ${newTask.priority === p.value ? p.borderColor : 'var(--border)'}`,
                                                            fontWeight: newTask.priority === p.value ? 700 : 500,
                                                            padding: '4px 6px'
                                                        }}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TARGET REGION</label>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {[
                                                    { value: 'Global', label: '🌐 Global' },
                                                    { value: 'India', label: '🇮🇳 India' },
                                                    { value: 'USA', label: '🇺🇸 USA' },
                                                    { value: 'Indonesia', label: '🇮🇩 Indo' }
                                                ].map(r => (
                                                    <button
                                                        key={r.value}
                                                        type="button"
                                                        className="btn btn-sm"
                                                        onClick={() => setNewTask(prev => ({ ...prev, region: r.value }))}
                                                        style={{
                                                            flex: '1 1 auto',
                                                            fontSize: '0.72rem',
                                                            background: newTask.region === r.value ? 'var(--accent-glow)' : 'var(--surface)',
                                                            color: newTask.region === r.value ? 'var(--accent)' : 'var(--text-secondary)',
                                                            border: `1px solid ${newTask.region === r.value ? 'var(--accent)' : 'var(--border)'}`,
                                                            fontWeight: newTask.region === r.value ? 700 : 500,
                                                            padding: '4px 6px'
                                                        }}
                                                    >
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Due Date & Assignees */}
                                    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>DUE DATE</label>
                                            <DateTimePicker value={newTask.due_date} onChange={val => setNewTask(p => ({ ...p, due_date: val }))} />
                                        </div>

                                        {isAdmin && (
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>ASSIGN TO AGENTS</label>
                                                <div style={{
                                                    maxHeight: '90px',
                                                    overflowY: 'auto',
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    padding: '6px 10px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px'
                                                }}>
                                                    {agents.map(a => (
                                                        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedAgentIds.includes(a.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setSelectedAgentIds([...selectedAgentIds, a.id]);
                                                                    } else {
                                                                        setSelectedAgentIds(selectedAgentIds.filter(id => id !== a.id));
                                                                    }
                                                                }}
                                                            />
                                                            {a.full_name} ({a.region})
                                                        </label>
                                                    ))}
                                                    {agents.length === 0 && (
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>No agents available</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Recurrence Setup */}
                                    <div className="glass-card" style={{ padding: 12 }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8, letterSpacing: '0.05em' }}>🔁 RECURRENCE PLANNER</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                            <div>
                                                <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>REPEAT PATTERN</label>
                                                <select className="select" value={taskRecurrence.type}
                                                    onChange={e => setTaskRecurrence(p => ({ ...p, type: e.target.value as RichRecurrenceType }))} style={{ fontSize: '0.78rem' }}>
                                                    {RICH_RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </div>
                                            {(taskRecurrence.type === 'weekly' || taskRecurrence.type === 'biweekly') && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2, letterSpacing: '0.05em' }}>REPEAT ON DAYS</label>
                                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                        {[
                                                            { value: '1', short: 'M', label: 'Mon' },
                                                            { value: '2', short: 'T', label: 'Tue' },
                                                            { value: '3', short: 'W', label: 'Wed' },
                                                            { value: '4', short: 'T', label: 'Thu' },
                                                            { value: '5', short: 'F', label: 'Fri' },
                                                            { value: '6', short: 'S', label: 'Sat' },
                                                            { value: '0', short: 'S', label: 'Sun' },
                                                        ].map(d => {
                                                            const currentDays = taskRecurrence.weeklyDays || [taskRecurrence.weeklyDay || '1'];
                                                            const active = currentDays.includes(d.value);
                                                            return (
                                                                <button
                                                                    key={d.value}
                                                                    type="button"
                                                                    className="btn btn-sm"
                                                                    title={d.label}
                                                                    onClick={() => {
                                                                        let nextDays = [...currentDays];
                                                                        if (active) {
                                                                            if (nextDays.length > 1) {
                                                                                nextDays = nextDays.filter(x => x !== d.value);
                                                                            }
                                                                        } else {
                                                                            nextDays.push(d.value);
                                                                        }
                                                                        setTaskRecurrence(p => ({
                                                                            ...p,
                                                                            weeklyDays: nextDays,
                                                                            weeklyDay: nextDays[0] || '1'
                                                                        }));
                                                                    }}
                                                                    style={{
                                                                        minWidth: 22,
                                                                        height: 22,
                                                                        borderRadius: '50%',
                                                                        padding: 0,
                                                                        fontSize: '0.68rem',
                                                                        background: active ? 'var(--accent-glow)' : 'var(--surface)',
                                                                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                                                                        fontWeight: active ? 700 : 500,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                    }}
                                                                >
                                                                    {d.short}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {taskRecurrence.type === 'monthly' && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>DAY OF MONTH</label>
                                                    <select className="select" title="Repeat on day of month" value={taskRecurrence.monthlyDay}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, monthlyDay: e.target.value }))} style={{ fontSize: '0.78rem' }}>
                                                        {Array.from({ length: 31 }, (_, idx) => (
                                                            <option key={idx + 1} value={String(idx + 1)}>{idx + 1}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            {taskRecurrence.type === 'custom_interval' && (
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>INTERVAL (DAYS)</label>
                                                    <input className="input" type="number" min={1} max={365}
                                                        value={taskRecurrence.customIntervalDays || 3}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, customIntervalDays: Math.max(parseInt(e.target.value, 10) || 1, 1) }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                            )}
                                        </div>

                                        {taskRecurrence.type !== 'none' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>MAX OCCURRENCES</label>
                                                    <input className="input" type="number" min={1} max={24} title="Number of occurrences"
                                                        value={taskRecurrence.count}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, count: Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 24) }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>STOP UNTIL (END DATE)</label>
                                                    <input className="input" type="date" value={taskRecurrence.endDate || ''}
                                                        onChange={e => setTaskRecurrence(p => ({ ...p, endDate: e.target.value }))} style={{ fontSize: '0.78rem' }} />
                                                </div>
                                            </div>
                                        )}

                                        {taskRecurrence.type !== 'none' && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '6px 10px', borderRadius: 6, marginTop: 8, border: '1px dashed var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span>🔄</span>
                                                <span>
                                                    {(() => {
                                                        const times = taskRecurrence.count;
                                                        const endDesc = taskRecurrence.endDate ? ` until ${taskRecurrence.endDate}` : '';
                                                        if (taskRecurrence.type === 'daily') return `Creates up to ${times} daily tasks${endDesc}.`;
                                                        if (taskRecurrence.type === 'weekly' || taskRecurrence.type === 'biweekly') {
                                                            const currentDays = taskRecurrence.weeklyDays || [taskRecurrence.weeklyDay || '1'];
                                                            const dayNames = currentDays.map(val => WEEKDAY_OPTIONS.find(d => d.value === val)?.label || '').filter(Boolean).join(', ');
                                                            const prefix = taskRecurrence.type === 'weekly' ? 'weekly' : 'bi-weekly';
                                                            return `Creates up to ${times} ${prefix} tasks on ${dayNames}${endDesc}.`;
                                                        }
                                                        if (taskRecurrence.type === 'monthly') return `Creates up to ${times} monthly tasks on day ${taskRecurrence.monthlyDay}${endDesc}.`;
                                                        if (taskRecurrence.type === 'custom_interval') return `Creates up to ${times} tasks repeating every ${taskRecurrence.customIntervalDays} days${endDesc}.`;
                                                        return '';
                                                    })()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                                        <button className="btn btn-secondary" onClick={() => setShowAddTask(false)}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleAddTask}>
                                            {isAdmin ? 'Create Task' : 'Submit for Approval'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}



                    {/* ── LinkedIn Token Warning Banner ─────────────────────── */}
                    {isAdmin && linkedinConnected === false && (
                        <div style={{
                            background: 'rgba(239,68,68,0.07)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 12,
                            padding: '12px 18px',
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>
                                    LinkedIn API — Token Expired or Invalid
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {linkedinError} · Live LinkedIn metrics are unavailable until the token is reconnected — tiles show “—” rather than estimated data.
                                </div>
                            </div>
                            <a
                                href="/settings"
                                style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                            >
                                Update Token in Settings →
                            </a>
                        </div>
                    )}

                    {/* ── Real LinkedIn Company-Page KPIs ─────────────────────────────── */}
                    <div className="grid-4" style={{ marginBottom: 16 }}>
                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <TrendingUp size={18} color="var(--accent)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL FOLLOWERS</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: kFollowers === null ? 'var(--text-muted)' : undefined }}>
                                {kFollowers !== null ? showVal(kFollowers) : (summary?.total_followers?.toLocaleString() || '—')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                <TrendingUp size={14} color={summary?.weekly_growth >= 0 ? 'var(--success)' : 'var(--danger)'} />
                                <span style={{ fontSize: '0.8rem', color: summary?.weekly_growth >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                    {summary?.weekly_growth >= 0 ? '+' : ''}{summary?.weekly_growth || 0} this week
                                </span>
                            </div>
                            {summary?.sparkline?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={40} style={{ marginTop: 8 }}>
                                    <AreaChart data={summary.sparkline.slice(-7)}>
                                        <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent-glow)" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                    {summary?.organic_followers != null
                                        ? `${Number(summary.organic_followers).toLocaleString()} organic · ${Number(summary.paid_followers || 0).toLocaleString()} paid`
                                        : (kFollowers === null ? 'Syncing after quota reset' : 'Company page total')}
                                </div>
                            )}
                        </div>

                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Eye size={18} color="var(--purple)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>IMPRESSIONS</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: kImpressions === null ? 'var(--text-muted)' : undefined }}>{showVal(kImpressions)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lifetime page impressions</div>
                        </div>

                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CheckCircle size={18} color="var(--success)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TASKS DONE</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{completedTasks.length}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeTasks.length} active</div>
                        </div>

                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Heart size={18} color="var(--warning)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ENGAGEMENT RATE</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: kEngagement === null ? 'var(--text-muted)' : undefined }}>{kEngagement === null ? '—' : `${kEngagement}%`}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across all page content</div>
                        </div>
                    </div>

                    {/* ── Real engagement sub-metrics ─────────────────────────────────── */}
                    <div className="grid-4" style={{ marginBottom: 8 }}>
                        {[
                            { label: 'UNIQUE REACH', value: kReach },
                            { label: 'POST CLICKS', value: kClicks },
                            { label: 'REACTIONS', value: kLikes },
                            { label: 'COMMENTS', value: kComments },
                        ].map(s => (
                            <div key={s.label} className="glass-card" style={{ padding: '14px 18px' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, color: s.value === null ? 'var(--text-muted)' : undefined }}>{showVal(s.value)}</div>
                            </div>
                        ))}
                    </div>

                    {/* Honest note about what's live vs. pending the daily-quota reset */}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {meta.available
                            ? <>Live LinkedIn data{meta.last_updated ? ` · updated ${new Date(meta.last_updated).toLocaleString()}` : ''}{meta.rate_limited ? ' · follower/visitor counts sync after LinkedIn\'s daily quota resets (00:00 UTC)' : ''}.</>
                            : <>Waiting for the first LinkedIn sync — metrics appear once the API responds.</>}
                    </div>

                    {/* ── Task Panel + Calendar (calendar sits on the right, up top) ────── */}
                    <div className="grid-2" style={{ marginBottom: 24 }}>
                        {/* Task Accountability Panel */}
                        <div className="chart-container">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div className="chart-title" style={{ margin: 0 }}>📋 Tasks</div>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowAddTask(true)}>
                                    <Plus size={14} /> New Task
                                </button>
                            </div>

                            <div style={{ position: 'relative', marginBottom: 12 }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input className="input" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
                            </div>

                            {isAdmin && overdue.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>
                                        ⚠ {new Set(overdue.map((o: any) => o.task_id)).size} overdue task{new Set(overdue.map((o: any) => o.task_id)).size > 1 ? 's' : ''} · {new Set(overdue.map((o: any) => o.agent_id)).size} agent{new Set(overdue.map((o: any) => o.agent_id)).size > 1 ? 's' : ''}
                                    </div>
                                    {overdue.slice(0, 3).map((o, i) => (
                                        <div key={i}
                                            onClick={() => navigate(`/workspace?taskId=${o.task_id}`)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(239,68,68,0.07)', borderRadius: 8, marginBottom: 4, cursor: 'pointer' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
                                        >
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)' }}>
                                                {o.agent_name?.charAt(0)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{o.agent_name}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span className="truncate">{o.task_title}</span>
                                                    <span style={{ flexShrink: 0, fontSize: '0.6rem', fontWeight: 700, color: o.claimed ? 'var(--warning)' : 'var(--danger)' }}>· {o.claimed ? 'in progress' : 'not accepted'}</span>
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                title="Message this agent"
                                                onClick={(e) => { e.stopPropagation(); navigate(`/chat?userId=${o.agent_id || ''}`); }}
                                                style={{ gap: 4, fontSize: '0.72rem' }}
                                            >
                                                <MessageSquare size={12} /> Msg
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {filteredTasks.slice(0, 10).map(t => {
                                    const statusInfo = getTaskStatusInfo(t);
                                    return (
                                        <div key={t.id}
                                            onClick={() => navigate(`/workspace?taskId=${t.id}`)}
                                            className="glass-card glass-card-hover"
                                            style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                        >
                                            <div className={`status-dot ${statusInfo.dotClass}`} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 500 }} className="truncate">{t.title}</div>
                                                {t.due_date && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Due: {new Date(t.due_date).toLocaleDateString()}</div>}
                                            </div>
                                            {t.post?.status === 'approved' && t.claimed_by_id === user?.id && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/workspace?taskId=${t.id}&tab=composer&action=publish`);
                                                    }}
                                                    className="btn btn-sm btn-primary"
                                                    style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                >
                                                    Publish
                                                </button>
                                            )}
                                            <span className={`badge ${statusInfo.className}`}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                    );
                                })}
                                {filteredTasks.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No tasks found</div>}
                            </div>
                        </div>

                        {/* Calendar — on the right, near the top */}
                        <CalendarPanel
                            tasks={tasks}
                            onAddTask={(d) => {
                                setNewTask(p => ({ ...p, due_date: format(d, "yyyy-MM-dd'T'HH:mm") }));
                                setShowAddTask(true);
                            }}
                            onNavigateToTask={(taskId) => navigate(`/workspace?taskId=${taskId}`)}
                        />
                    </div>

                    {/* ── Followers Growth & Trends — driven by the period selector above ─ */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 14 }}>
                            👥 FOLLOWERS GROWTH &amp; TRENDS · {trendPeriod.label.toUpperCase()}
                        </div>

                        {/* Rolling-window net change cards (current, fixed windows) */}
                        {followerHistory && followerHistory.snapshot_count > 0 && (
                            <div className="grid-4" style={{ marginBottom: 16 }}>
                                {[
                                    { key: 'd1', label: 'NET · LAST 24H', sub: 'vs yesterday', color: 'var(--success)', n: 1 },
                                    { key: 'd7', label: 'NET · LAST 7 DAYS', sub: 'vs 7 days ago', color: '#7c3aed', n: 7 },
                                    { key: 'd14', label: 'NET · LAST 14 DAYS', sub: 'vs 14 days ago', color: '#0891b2', n: 14 },
                                    { key: 'd30', label: 'NET · LAST 30 DAYS', sub: 'vs 30 days ago', color: '#f59e0b', n: 30 },
                                ].map(({ key, label, sub, color, n }) => {
                                    const w = (followerHistory.windows || {})[key] || {};
                                    const has = w.delta !== null && w.delta !== undefined;
                                    const positive = has && w.delta >= 0;
                                    return (
                                        <div key={key} className="glass-card" style={{ padding: '14px 18px', borderLeft: `3px solid ${color}` }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 5 }}>{label}</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: has ? (positive ? '#10b981' : '#ef4444') : 'var(--text-muted)' }}>
                                                {has ? `${positive ? '+' : ''}${w.delta.toLocaleString()}` : '—'}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {has
                                                    ? (w.pct !== null && w.pct !== undefined ? `${w.pct >= 0 ? '+' : ''}${w.pct}% · ${sub}` : `followers · ${sub}`)
                                                    : `accumulating · needs ${n}-day history`}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {(() => {
                            const t = dailyTrend?.trend || [];
                            if (t.length < 2) {
                                return (
                                    <div className="glass-card" style={{ padding: 22, textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>📅</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Accumulating trend data…</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
                                            One real snapshot is recorded per day. Trends fill in day by day — nothing estimated.{dailyTrend?.snapshot_count ? ` ${dailyTrend.snapshot_count} day(s) captured so far.` : ''}
                                        </div>
                                    </div>
                                );
                            }
                            const deltas: any[] = [];
                            for (let i = 1; i < t.length; i++) {
                                deltas.push({
                                    day: fmtDay(t[i].date),
                                    net: t[i].followers - t[i - 1].followers,
                                    impressions: Math.max(0, t[i].impressions - t[i - 1].impressions),
                                    engagement: Math.max(0, t[i].engagement - t[i - 1].engagement),
                                });
                            }
                            const series = t.map((r: any) => ({ day: fmtDay(r.date), followers: r.followers }));
                            const first = t[0], last = t[t.length - 1];
                            const totFollowers = last.followers - first.followers;
                            const totImpr = Math.max(0, last.impressions - first.impressions);
                            const totEng = Math.max(0, last.engagement - first.engagement);
                            const totClicks = Math.max(0, last.clicks - first.clicks);
                            const fv = series.map((s: any) => s.followers);
                            const minF = Math.min(...fv), maxF = Math.max(...fv);
                            const pad = Math.max(5, Math.round((maxF - minF) * 0.15));
                            const tip = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem' };
                            const stat = (label: string, val: number, color: string, signed: boolean) => (
                                <div className="glass-card" style={{ padding: '12px 16px' }}>
                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 5 }}>{label}</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: signed ? (val >= 0 ? '#10b981' : '#ef4444') : color }}>{signed && val >= 0 ? '+' : ''}{val.toLocaleString()}</div>
                                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 2 }}>over {t.length} days</div>
                                </div>
                            );
                            return (
                                <>
                                    <div className="grid-4" style={{ marginBottom: 14 }}>
                                        {stat('NEW FOLLOWERS', totFollowers, '#2563eb', true)}
                                        {stat('IMPRESSIONS GAINED', totImpr, '#7c3aed', false)}
                                        {stat('ENGAGEMENT GAINED', totEng, '#10b981', false)}
                                        {stat('POST CLICKS GAINED', totClicks, '#f59e0b', false)}
                                    </div>
                                    <div className="grid-2" style={{ marginBottom: 14 }}>
                                        <div className="chart-container" style={{ padding: 16 }}>
                                            <div className="chart-title" style={{ marginBottom: 8, fontSize: '0.82rem' }}>Follower Count</div>
                                            <ResponsiveContainer width="100%" height={170}>
                                                <AreaChart data={series} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.32} />
                                                            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                                    <YAxis domain={[minF - pad, maxF + pad]} width={42} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                                                    <Tooltip contentStyle={tip} formatter={(v: any) => [v.toLocaleString(), 'Followers']} />
                                                    <Area type="monotone" dataKey="followers" stroke="#2563eb" strokeWidth={2} fill="url(#fgGrad)" dot={{ r: 2.5, fill: '#2563eb' }} activeDot={{ r: 4 }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="chart-container" style={{ padding: 16 }}>
                                            <div className="chart-title" style={{ marginBottom: 8, fontSize: '0.82rem' }}>Daily Net Followers (+ / −)</div>
                                            <ResponsiveContainer width="100%" height={170}>
                                                <BarChart data={deltas} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                                    <YAxis width={36} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                                    <Tooltip contentStyle={tip} formatter={(v: any) => [`${v >= 0 ? '+' : ''}${v}`, 'Net followers']} />
                                                    <ReferenceLine y={0} stroke="var(--border)" />
                                                    <Bar dataKey="net" radius={[3, 3, 0, 0]} name="Net followers">
                                                        {deltas.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#10b981' : '#ef4444'} />)}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="chart-container" style={{ padding: 16 }}>
                                            <div className="chart-title" style={{ marginBottom: 8, fontSize: '0.82rem' }}>Engagement / Day</div>
                                            <ResponsiveContainer width="100%" height={160}>
                                                <BarChart data={deltas} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                                    <YAxis width={36} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                                    <Tooltip contentStyle={tip} />
                                                    <Bar dataKey="engagement" fill="#10b981" radius={[3, 3, 0, 0]} name="Engagement" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="chart-container" style={{ padding: 16 }}>
                                            <div className="chart-title" style={{ marginBottom: 8, fontSize: '0.82rem' }}>Impressions / Day</div>
                                            <ResponsiveContainer width="100%" height={160}>
                                                <BarChart data={deltas} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                                    <YAxis width={40} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                                                    <Tooltip contentStyle={tip} />
                                                    <Bar dataKey="impressions" fill="#7c3aed" radius={[3, 3, 0, 0]} name="Impressions" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
                                        Real day-over-day change · window follows the selector above · green = gained, red = lost. No estimates or fabricated data.
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* LinkedIn engagement + audience demographics now live in the single
                        "Detailed Analytics" section below (embedded Analytics Hub) — no
                        duplication, one professional home for the deep breakdowns. */}

                </>
            )}

            {/* ── Detailed Analytics — merged into this single combined dashboard ── */}
            <div style={{ marginTop: 12, paddingTop: 20, borderTop: '2px solid var(--border)' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 2 }}>📊 Detailed Analytics</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>Engagement, audience &amp; company posts — deeper breakdowns of the same live data.</div>
                <AnalyticsHubView region={region} embedded />
            </div>
        </div>
    );
};
