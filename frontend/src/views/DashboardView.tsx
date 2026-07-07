import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, Eye, Heart, CheckCircle, Clock,
    AlertTriangle, Search, Plus, X, MessageSquare, CheckSquare
} from 'lucide-react';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths
} from 'date-fns';
import { metricsApi, tasksApi, usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { PageMetric, Task, User } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AnalyticsHubView } from './AnalyticsHubView';

// ── Login Popup ────────────────────────────────────────────────────────────
const LoginPopup: React.FC<{ onClose: () => void; user: User; tasks: Task[]; pendingApprovals: Task[] }> = ({ onClose, user, tasks, pendingApprovals }) => {
    const dueTodayTasks = tasks.filter(t =>
        t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString() && t.status !== 'completed'
    );
    const allClear = dueTodayTasks.length === 0 && pendingApprovals.length === 0;

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
                        {user.role === 'agent' && dueTodayTasks.length > 0 && (
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} /> Tasks Due Today ({dueTodayTasks.length})
                                </div>
                                {dueTodayTasks.map(t => (
                                    <div key={t.id} className="glass-card" style={{ padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <CheckSquare size={14} color="var(--warning)" />
                                        <span style={{ fontSize: '0.875rem', flex: 1 }}>{t.title}</span>
                                        <span className="badge badge-warning">Due Today</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4>📅 Task Calendar</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>‹</button>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: 110, textAlign: 'center' }}>
                        {format(currentMonth, 'MMMM yyyy')}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>›</button>
                </div>
            </div>

            <div className="calendar-grid" style={{ marginBottom: 8 }}>
                {dayLabels.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
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
                                cursor: 'pointer'
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
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                {Object.entries(statusColor).map(([s, c]) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                        {s.replace('_', ' ')}
                    </div>
                ))}
            </div>

            {/* Short Tasks Overlay/Panel */}
            <div style={{
                marginTop: 16,
                padding: '12px 14px',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                    {selectedDayTasks.map(t => (
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
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
                                {t.title}
                            </span>
                            <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'active' ? 'badge-accent' : t.status === 'pending_approval' ? 'badge-warning' : 'badge-muted'}`} style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                                {t.status.replace('_', ' ')}
                            </span>
                        </div>
                    ))}
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
    const [searchParams, setSearchParams] = useSearchParams();
    const view = searchParams.get('view') === 'analytics' ? 'analytics' : 'dashboard';
    const [metrics, setMetrics] = useState<PageMetric[]>([]);
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
    const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', assigned_to_id: '' });
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
            const [mRes, sumRes, tRes] = await Promise.all([
                metricsApi.page({ region: region === 'Global' ? undefined : region, days: 30 }),
                metricsApi.dashboardSummary(region === 'Global' ? undefined : region),
                tasksApi.list({ region: region === 'Global' ? undefined : region }),
            ]);
            setMetrics(mRes.data);
            setSummary(sumRes.data);
            setTasks(tRes.data);

            if (isAdmin) {
                const [paRes, ovRes, agRes] = await Promise.all([
                    tasksApi.pendingApprovals(),
                    tasksApi.accountability(region === 'Global' ? undefined : region),
                    usersApi.list({ role: 'agent' }),
                ]);
                setPendingApprovals(paRes.data);
                setOverdue(ovRes.data);
                setAgents(agRes.data);
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
        // Subsequent polls: silent (no skeleton flicker)
        const interval = setInterval(() => loadAll(true), 30000);
        return () => clearInterval(interval);
    }, [region]);




    const handleAddTask = async () => {
        if (!newTask.title.trim()) return toast.error('Task title is required');
        try {
            await tasksApi.create({ ...newTask, region });
            toast.success(isAdmin ? 'Task created!' : 'Task submitted for approval');
            setShowAddTask(false);
            setNewTask({ title: '', description: '', due_date: '', assigned_to_id: '' });
            loadAll(true);
        } catch { toast.error('Failed to create task'); }
    };

    const filteredTasks = tasks.filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()));
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const activeTasks = tasks.filter(t => ['active', 'in_progress'].includes(t.status));

    // Format chart data
    const chartData = metrics.reduce((acc: any[], m) => {
        const existing = acc.find(d => d.date === m.metric_date);
        if (existing) {
            existing.followers = (existing.followers || 0) + m.followers;
            existing.visitors = (existing.visitors || 0) + m.visitors;
            existing.engagement = (existing.engagement || 0) + m.likes + m.comments + m.shares;
        } else {
            acc.push({
                date: m.metric_date.slice(5),
                followers: m.followers,
                visitors: m.visitors,
                likes: m.likes,
                comments: m.comments,
                shares: m.shares,
                engagement: m.likes + m.comments + m.shares,
            });
        }
        return acc;
    }, []).slice(-14);

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
            {/* View Selector Tabs */}
            <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                <button
                    onClick={() => setSearchParams({ view: 'dashboard' })}
                    style={{
                        padding: '8px 16px', background: 'transparent', border: 'none',
                        borderBottom: view === 'dashboard' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: view === 'dashboard' ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: view === 'dashboard' ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                >
                    🏠 Business Dashboard
                </button>
                <button
                    onClick={() => setSearchParams({ view: 'analytics' })}
                    style={{
                        padding: '8px 16px', background: 'transparent', border: 'none',
                        borderBottom: view === 'analytics' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: view === 'analytics' ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: view === 'analytics' ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                >
                    📊 Analytics Hub
                </button>
            </div>

            {view === 'analytics' ? (
                <AnalyticsHubView region={region} />
            ) : (
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
                                    <div className="form-group">
                                        <label className="form-label">Due Date</label>
                                        <input className="input" type="datetime-local" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} />
                                    </div>
                                    {isAdmin && agents.length > 0 && (
                                        <div className="form-group">
                                            <label className="form-label">Assign To (optional)</label>
                                            <select className="select" value={newTask.assigned_to_id} onChange={e => setNewTask(p => ({ ...p, assigned_to_id: e.target.value }))}>
                                                <option value="">Unassigned (anyone)</option>
                                                {agents.map(a => (
                                                    <option key={a.id} value={a.id}>{a.full_name} ({a.region})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {!isAdmin && <div className="badge badge-warning" style={{ alignSelf: 'flex-start' }}>Requires admin approval</div>}
                                    <button className="btn btn-primary" onClick={handleAddTask} style={{ marginTop: 4 }}>
                                        {isAdmin ? 'Create Task' : 'Submit for Approval'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}



                    {/* ── Hero Signal Tile + KPIs ─────────────────────────────────────── */}
                    <div className="grid-4" style={{ marginBottom: 20 }}>
                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <TrendingUp size={18} color="var(--accent)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL FOLLOWERS</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{summary?.total_followers?.toLocaleString() || '—'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <span style={{ fontSize: '0.75rem', color: summary?.weekly_growth >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                    {summary?.weekly_growth >= 0 ? '+' : ''}{summary?.weekly_growth || 0} this week
                                </span>
                            </div>
                            {summary?.sparkline?.length > 0 && (
                                <ResponsiveContainer width="100%" height={30} style={{ marginTop: 12 }}>
                                    <AreaChart data={summary.sparkline.slice(-7)}>
                                        <Tooltip
                                            contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem', padding: '4px 8px' }}
                                            formatter={(value: any) => [value, 'Followers']}
                                            labelStyle={{ display: 'none' }}
                                            cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '3 3' }}
                                        />
                                        <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="var(--accent-glow)" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="glass-card glass-card-hover" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Eye size={18} color="var(--info)" />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PAGE VISITORS</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{metrics.reduce((sum, m) => sum + m.visitors, 0).toLocaleString()}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 30 days</div>
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
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AVG. ENGAGEMENT</span>
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{summary?.avg_engagement_rate || 0}%</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Engagement rate</div>
                        </div>
                    </div>

                    {/* ── Charts Row ──────────────────────────────────────────────────── */}
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        <div className="chart-container">
                            <div className="chart-title">📈 Follower Growth</div>
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="followGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                    <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                    <Area type="monotone" dataKey="followers" stroke="var(--accent)" fill="url(#followGrad)" strokeWidth={2} dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="chart-container">
                            <div className="chart-title">👁 Page Visitors</div>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                    <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                    <Line type="monotone" dataKey="visitors" stroke="var(--purple)" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="chart-container" style={{ marginBottom: 20 }}>
                        <div className="chart-title">💬 Post Interaction Trends</div>
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="likes" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="comments" fill="var(--purple)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="shares" fill="var(--info)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ── Task Panel + Calendar ────────────────────────────────────────── */}
                    <div className="grid-2" style={{ marginBottom: 20 }}>
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
                                        ⚠ Missed by {overdue.length} agent(s)
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
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{o.agent_name}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{o.task_title}</div>
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
                                {filteredTasks.slice(0, 10).map(t => (
                                    <div key={t.id}
                                        onClick={() => navigate(`/workspace?taskId=${t.id}`)}
                                        className="glass-card glass-card-hover"
                                        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                    >
                                        <div className={`status-dot dot-${t.status === 'completed' ? 'completed' : t.status === 'active' ? 'active' : t.status === 'pending_approval' ? 'pending' : 'draft'}`} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 500 }} className="truncate">{t.title}</div>
                                            {t.due_date && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Due: {new Date(t.due_date).toLocaleDateString()}</div>}
                                        </div>
                                        <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'active' ? 'badge-accent' : t.status === 'pending_approval' ? 'badge-warning' : 'badge-muted'}`}>
                                            {t.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                ))}
                                {filteredTasks.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No tasks found</div>}
                            </div>
                        </div>

                        {/* Calendar */}
                        <CalendarPanel
                            tasks={tasks}
                            onAddTask={(d) => {
                                setNewTask(p => ({ ...p, due_date: format(d, "yyyy-MM-dd'T'HH:mm") }));
                                setShowAddTask(true);
                            }}
                            onNavigateToTask={(taskId) => navigate(`/workspace?taskId=${taskId}`)}
                        />
                    </div>
                </>
            )}

        </div>
    );
};
