import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
    Users, AlertTriangle, Award, Target, Zap, RefreshCw,
    ChevronDown, ChevronUp, CheckCircle2, XCircle, Timer, Clock, MessageSquare,
} from 'lucide-react';
import { usersApi, tasksApi, alertsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

interface Props { region: string; }

const AWARD_COLORS = ['#f59e0b', '#94a3b8', '#cd7c3c'];
const ROLE_COLORS: Record<string, string> = { admin: '#7c3aed', ceo: '#db2777', developer: '#0891b2', agent: '#2563eb' };

const BADGES = [
    { label: '🥇 Gold', min: 80, color: '#fbbf24' },
    { label: '🥈 Silver', min: 60, color: '#9ca3af' },
    { label: '🥉 Bronze', min: 40, color: '#d97706' },
    { label: '📋 Active', min: 0, color: '#2563eb' },
];
const getBadge = (score: number) => BADGES.find(b => score >= b.min) || BADGES[3];

const isOverdue = (t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date();
const agentTasksOf = (tasks: any[], id: string) =>
    tasks.filter(t => (t.assignments || []).some((a: any) => a.agent_id === id) || t.claimed_by_id === id);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600 }}>{(p.value || 0).toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

// Score model shared by admin leaderboard + agent self-view (real, from tasks).
const scoreOf = (completed: number, overdue: number, completionRate: number) =>
    Math.max(0, Math.round(completionRate * 1.5 + completed * 2 - overdue * 5));

export const EngagementView: React.FC<Props> = ({ region }) => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || (user as any)?.role === 'ceo';

    const [agents, setAgents] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'leaderboard' | 'tasks' | 'alerts'>('leaderboard');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const initial = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            if (isAdmin) {
                const [uRes, tRes, aRes] = await Promise.all([
                    usersApi.list({ role: 'agent', region: region === 'Global' ? undefined : region }),
                    tasksApi.list({ region: region === 'Global' ? undefined : region, limit: 200 }),
                    alertsApi.list({ resolved: false }).catch(() => ({ data: [] })),
                ]);
                setAgents(uRes.data);
                setTasks(tRes.data);
                setAlerts(aRes.data || []);
            } else {
                const tRes = await tasksApi.list({});
                setTasks(tRes.data);
            }
            setLastUpdated(new Date());
        } catch { /* keep last good on transient errors */ }
        if (!silent) setLoading(false);
    }, [region, isAdmin]);

    useEffect(() => {
        if (!initial.current) initial.current = true;
        load(false);
        const t = setInterval(() => load(true), 20000);
        return () => clearInterval(t);
    }, [load]);

    // ── Admin leaderboard (real, computed from tasks) ────────────────────────
    const leaderboard = agents.map(agent => {
        const at = agentTasksOf(tasks, agent.id);
        const completed = at.filter(t => t.status === 'completed').length;
        const overdue = at.filter(isOverdue).length;
        const inProgress = at.filter(t => t.status === 'in_progress').length;
        const pending = at.filter(t => t.status === 'pending_approval').length;
        const total = at.length;
        const completionRate = total ? Math.round((completed / total) * 100) : 0;
        return { ...agent, completed, overdue, inProgress, pending, total, completionRate, score: scoreOf(completed, overdue, completionRate) };
    }).sort((a, b) => b.score - a.score);

    const overdueTasks = tasks.filter(isOverdue);
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const teamChart = leaderboard.map(a => ({ name: a.full_name?.split(' ')[0] || 'Agent', completed: a.completed, pending: a.pending, overdue: a.overdue }));
    const top = leaderboard[0];
    const radar = top ? [
        { metric: 'Completion', value: top.completionRate },
        { metric: 'Activity', value: Math.min(100, top.total * 5) },
        { metric: 'Speed', value: Math.max(0, 100 - top.overdue * 20) },
        { metric: 'Volume', value: Math.min(100, top.completed * 8) },
        { metric: 'Focus', value: Math.max(0, 100 - top.pending * 10) },
    ] : [];

    if (loading) {
        return <div className="page-content"><div className="grid-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div></div>;
    }

    // ── Agent self-view ──────────────────────────────────────────────────────
    if (!isAdmin) {
        const mine = tasks;  // backend already scopes to the agent's assigned tasks
        const completed = mine.filter(t => t.status === 'completed').length;
        const active = mine.filter(t => ['active', 'in_progress'].includes(t.status)).length;
        const overdue = mine.filter(isOverdue).length;
        const total = mine.length;
        const completionRate = total ? Math.round((completed / total) * 100) : 0;
        const score = scoreOf(completed, overdue, completionRate);
        const badge = getBadge(score);
        return (
            <div className="page-content animate-fade">
                <div className="page-header">
                    <div className="page-header-left">
                        <div className="page-title">My Engagement</div>
                        <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="status-dot active" /> Live · Updated {lastUpdated.toLocaleTimeString()}
                        </div>
                    </div>
                    <div className="page-header-right">
                        <button className="btn btn-secondary btn-icon" onClick={() => load(false)} title="Refresh"><RefreshCw size={15} /></button>
                    </div>
                </div>

                <div className="grid-4" style={{ marginBottom: 20 }}>
                    {[
                        { label: 'Tasks Completed', value: completed, icon: CheckCircle2, color: '#10b981' },
                        { label: 'Active Tasks', value: active, icon: Clock, color: '#2563eb' },
                        { label: 'Overdue', value: overdue, icon: AlertTriangle, color: '#ef4444' },
                        { label: 'Performance Score', value: score, icon: Award, color: badge.color },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="stat-card animate-slide-up">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span className="stat-label">{label}</span>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={color} /></div>
                            </div>
                            <div className="stat-number" style={{ color }}>{value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid-2" style={{ marginBottom: 20 }}>
                    <div className="chart-container">
                        <div className="section-header"><div className="section-title"><Target size={16} color="var(--accent)" /> Completion Rate</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 8px' }}>
                            <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--accent)' }}>{completionRate}%</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ height: 10, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${completionRate}%`, background: completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 99, transition: 'width 0.6s' }} />
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>{completed} of {total} tasks completed</div>
                            </div>
                        </div>
                    </div>
                    <div className="chart-container">
                        <div className="section-header"><div className="section-title"><Award size={16} color="#f59e0b" /> Your Badge</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 8px' }}>
                            <div style={{ fontSize: '2.6rem' }}>{badge.label.split(' ')[0]}</div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: badge.color }}>{badge.label}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Score: {score} pts</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="table-wrapper">
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}><div className="section-title">📋 My Tasks ({total})</div></div>
                    <table className="data-table">
                        <thead><tr><th>Task</th><th>Status</th><th>Due</th><th>Overdue</th></tr></thead>
                        <tbody>
                            {mine.length === 0 ? <tr><td colSpan={4}><div className="empty-state">No tasks assigned to you yet</div></td></tr> :
                                mine.slice(0, 50).map(t => (
                                    <tr key={t.id} style={{ background: isOverdue(t) ? 'rgba(239,68,68,0.04)' : 'transparent', cursor: 'pointer' }} onClick={() => navigate(`/workspace?taskId=${t.id}`)}>
                                        <td><div className="truncate" style={{ maxWidth: 420, fontWeight: 600, fontSize: '0.82rem' }}>{t.title}</div></td>
                                        <td><span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'in_progress' ? 'badge-accent' : t.status === 'pending_approval' ? 'badge-warning' : 'badge-gray'}`}>{t.status?.replace(/_/g, ' ')}</span></td>
                                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                                        <td>{isOverdue(t) ? <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.78rem' }}>{Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000)}d</span> : <span style={{ color: 'var(--success)' }}>✓</span>}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // ── Admin / team view ────────────────────────────────────────────────────
    return (
        <div className="page-content animate-fade">
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Engagement</div>
                    <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="status-dot active" /> Live · Updated {lastUpdated.toLocaleTimeString()} · {region === 'Global' ? 'All Regions' : region}
                    </div>
                </div>
                <div className="page-header-right">
                    <button className="btn btn-secondary btn-icon" onClick={() => load(false)} title="Refresh"><RefreshCw size={15} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} /></button>
                </div>
            </div>

            {/* Team KPI row */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                {[
                    { label: 'Total Agents', value: agents.length, icon: Users, color: '#2563eb' },
                    { label: 'Tasks Completed', value: completedTasks.length, icon: CheckCircle2, color: '#10b981' },
                    { label: 'Overdue Tasks', value: overdueTasks.length, icon: XCircle, color: '#ef4444' },
                    { label: 'Open Alerts', value: alerts.length, icon: AlertTriangle, color: '#f59e0b' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="stat-card animate-slide-up">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span className="stat-label">{label}</span>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} color={color} /></div>
                        </div>
                        <div className="stat-number">{value}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {(['leaderboard', 'tasks', 'alerts'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        padding: '10px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px',
                    }}>
                        {tab === 'leaderboard' ? '🏆 Leaderboard' : tab === 'tasks' ? '📋 Task Monitor' : '🚨 Alerts'}
                    </button>
                ))}
            </div>

            {activeTab === 'leaderboard' && (
                <>
                    {leaderboard.length >= 3 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 28, padding: '20px 0 0' }}>
                            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((agent: any, pos: number) => {
                                const rank = pos === 0 ? 2 : pos === 1 ? 1 : 3;
                                const height = rank === 1 ? 120 : rank === 2 ? 92 : 74;
                                const medal = AWARD_COLORS[rank - 1];
                                const initials = agent?.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
                                return (
                                    <div key={agent?.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ width: rank === 1 ? 54 : 44, height: rank === 1 ? 54 : 44, borderRadius: '50%', background: ROLE_COLORS[agent?.role] || '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: rank === 1 ? '1rem' : '0.85rem', fontWeight: 700, color: '#fff', border: `3px solid ${medal}`, boxShadow: `0 0 0 3px ${medal}40` }}>{initials}</div>
                                            <div style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: medal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, border: '2px solid #fff' }}>{rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{agent?.full_name?.split(' ')[0]}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: medal }}>{agent?.score} pts</div>
                                        </div>
                                        <div style={{ width: 100, height, borderRadius: '8px 8px 0 0', background: `linear-gradient(135deg, ${medal}30, ${medal}15)`, border: `2px solid ${medal}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: medal }}>#{rank}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {teamChart.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
                            <div className="chart-container">
                                <div className="section-header"><div className="section-title"><Target size={16} color="var(--accent)" /> Task Performance by Agent</div></div>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={teamChart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                        <Bar dataKey="completed" name="Completed" fill="#10b981" stackId="a" />
                                        <Bar dataKey="pending" name="Pending" fill="#3b82f6" stackId="a" />
                                        <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {top && radar.length > 0 && (
                                <div className="chart-container">
                                    <div className="section-header"><div className="section-title"><Award size={16} color="#f59e0b" /> Top Agent Profile</div></div>
                                    <div style={{ textAlign: 'center', marginBottom: 4, fontSize: '0.8rem', fontWeight: 700 }}>{top.full_name}</div>
                                    <ResponsiveContainer width="100%" height={175}>
                                        <RadarChart data={radar}>
                                            <PolarGrid stroke="var(--border)" />
                                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                                            <Radar name="Performance" dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="table-wrapper">
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}><div className="section-title">Agent Leaderboard</div></div>
                        <table className="data-table">
                            <thead><tr><th>#</th><th>Agent</th><th>Completion</th><th>Completed</th><th>In Progress</th><th>Overdue</th><th>Score</th><th></th></tr></thead>
                            <tbody>
                                {leaderboard.map((a: any, i: number) => {
                                    const roleColor = ROLE_COLORS[a.role] || '#2563eb';
                                    const initials = a.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
                                    return (
                                        <React.Fragment key={a.id}>
                                            <tr style={{ background: expanded === a.id ? 'rgba(37,99,235,0.04)' : 'transparent' }}>
                                                <td><div style={{ width: 26, height: 26, borderRadius: '50%', background: i < 3 ? AWARD_COLORS[i] : 'var(--bg-tertiary)', color: i < 3 ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700 }}>{i + 1}</div></td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: roleColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                                                        <div><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.full_name}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.region || 'Global'} · {a.email}</div></div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ flex: 1, maxWidth: 100, height: 6, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                            <div style={{ width: `${a.completionRate}%`, height: '100%', borderRadius: 99, background: a.completionRate >= 80 ? '#10b981' : a.completionRate >= 50 ? '#f59e0b' : '#ef4444' }} />
                                                        </div>
                                                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{a.completionRate}%</span>
                                                    </div>
                                                </td>
                                                <td><span style={{ color: 'var(--success)', fontWeight: 700 }}>{a.completed}</span></td>
                                                <td><span style={{ color: 'var(--info)', fontWeight: 600 }}>{a.inProgress}</span></td>
                                                <td>{a.overdue > 0 ? <span className="badge badge-danger">{a.overdue} overdue</span> : <span className="badge badge-success">On track</span>}</td>
                                                <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} color={i < 3 ? AWARD_COLORS[i] : 'var(--text-muted)'} /><span style={{ fontWeight: 700, color: i < 3 ? AWARD_COLORS[i] : 'var(--text-primary)' }}>{a.score}</span></div></td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 2 }}>
                                                        <button className="btn btn-ghost btn-icon btn-sm" title="Message" onClick={() => navigate(`/chat?userId=${a.id}`)}><MessageSquare size={13} /></button>
                                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>{expanded === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded === a.id && (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '14px 20px', background: 'var(--bg-tertiary)' }}>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Recent tasks ({a.total})</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {agentTasksOf(tasks, a.id).slice(0, 6).map((t: any) => (
                                                                <div key={t.id} onClick={() => navigate(`/workspace?taskId=${t.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 8, borderLeft: `3px solid ${isOverdue(t) ? 'var(--danger)' : t.status === 'completed' ? 'var(--success)' : 'var(--accent)'}`, cursor: 'pointer' }}>
                                                                    <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }} className="truncate">{t.title}</div>
                                                                    <span className={`badge ${t.status === 'completed' ? 'badge-success' : 'badge-gray'}`} style={{ fontSize: '0.62rem' }}>{t.status?.replace(/_/g, ' ')}</span>
                                                                </div>
                                                            ))}
                                                            {a.total === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No tasks assigned.</div>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {leaderboard.length === 0 && <tr><td colSpan={8}><div className="empty-state">No agents found</div></td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'tasks' && (
                <div className="table-wrapper">
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="section-title">All Tasks Monitor</div>
                        <div style={{ display: 'flex', gap: 8 }}><span className="badge badge-danger">{overdueTasks.length} overdue</span><span className="badge badge-gray">{tasks.length} total</span></div>
                    </div>
                    <table className="data-table">
                        <thead><tr><th>Task</th><th>Agent</th><th>Status</th><th>Priority</th><th>Due</th><th>Region</th><th>Overdue</th></tr></thead>
                        <tbody>
                            {[...tasks].sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0)).slice(0, 60).map((t: any) => {
                                const agent = agents.find(a => a.id === (t.claimed_by_id || t.assignments?.[0]?.agent_id));
                                return (
                                    <tr key={t.id} style={{ background: isOverdue(t) ? 'rgba(239,68,68,0.04)' : 'transparent', cursor: 'pointer' }} onClick={() => navigate(`/workspace?taskId=${t.id}`)}>
                                        <td><div className="truncate" style={{ maxWidth: 300, fontWeight: 600, fontSize: '0.82rem' }}>{t.title}</div></td>
                                        <td>{agent ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 24, height: 24, borderRadius: '50%', background: ROLE_COLORS[agent.role] || '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>{agent.full_name?.charAt(0)}</div><span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{agent.full_name?.split(' ')[0]}</span></div> : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unassigned</span>}</td>
                                        <td><span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'in_progress' ? 'badge-accent' : t.status === 'pending_approval' ? 'badge-warning' : 'badge-gray'}`}>{t.status?.replace(/_/g, ' ')}</span></td>
                                        <td><span className={`badge ${t.priority === 'high' ? 'badge-danger' : t.priority === 'medium' ? 'badge-warning' : 'badge-gray'}`}>{t.priority || 'medium'}</span></td>
                                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                                        <td><span className="badge badge-info">{t.region || 'Global'}</span></td>
                                        <td>{isOverdue(t) ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 600 }}><Timer size={12} />{Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000)}d</div> : <span style={{ color: 'var(--success)', fontSize: '0.78rem' }}>✓</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'alerts' && (
                alerts.length === 0 ? (
                    <div className="empty-state" style={{ padding: 60 }}><div className="empty-state-icon">✅</div><div style={{ fontWeight: 600, marginBottom: 6 }}>All Clear!</div><div style={{ fontSize: '0.82rem' }}>No unresolved alerts at this time.</div></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {alerts.map((al: any) => (
                            <div key={al.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', borderLeft: `4px solid var(--${al.severity === 'critical' ? 'danger' : al.severity === 'warning' ? 'warning' : 'info'})` }}>
                                <div style={{ fontSize: '1.4rem' }}>{al.severity === 'critical' ? '🚨' : al.severity === 'warning' ? '⚠️' : 'ℹ️'}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 2 }}>{al.title}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{al.description}</div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{al.created_at ? new Date(al.created_at).toLocaleDateString() : ''}</div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};
