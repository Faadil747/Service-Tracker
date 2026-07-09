import React, { useEffect, useState, useCallback } from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
    Users, AlertTriangle,
    Award, Target, Zap, RefreshCw, ChevronDown, ChevronUp,
    CheckCircle2, XCircle, Timer
} from 'lucide-react';
import { usersApi, tasksApi, alertsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface Props { region: string; }

const AWARD_COLORS = ['#f59e0b', '#94a3b8', '#cd7c3c'];

const ROLE_COLORS: Record<string, string> = {
    admin: '#7c3aed', ceo: '#db2777', developer: '#0891b2', agent: '#2563eb',
};

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

export const AccountabilityView: React.FC<Props> = ({ region }) => {
    const { user } = useAuthStore();
    const [agents, setAgents] = useState<any[]>([]);
    const [agentStats, setAgentStats] = useState<Record<string, any>>({});
    const [tasks, setTasks] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'leaderboard' | 'tasks' | 'alerts'>('leaderboard');
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [uRes, tRes, aRes] = await Promise.all([
                usersApi.list({ role: 'agent' }),
                tasksApi.list({ region: region === 'Global' ? undefined : region, limit: 200 }),
                alertsApi.list({ resolved: false }),
            ]);
            setAgents(uRes.data);
            setTasks(tRes.data);
            setAlerts(aRes.data);
            setLastUpdated(new Date());

            // Fetch per-agent stats
            const stats: Record<string, any> = {};
            await Promise.allSettled(
                uRes.data.map(async (a: any) => {
                    try {
                        const s = await usersApi.stats(a.id);
                        stats[a.id] = s.data;
                    } catch { stats[a.id] = {}; }
                })
            );
            setAgentStats(stats);
        } catch { }
        setLoading(false);
    }, [region]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [load]);

    // Only admins/ceos can see this page
    const isAllowed = user?.role === 'admin' || (user as any)?.role === 'ceo';
    if (!isAllowed) {
        return (
            <div className="page-content">
                <div className="empty-state" style={{ padding: '80px 24px' }}>
                    <div className="empty-state-icon">🔒</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>Access Restricted</div>
                    <div style={{ fontSize: '0.85rem' }}>This page is only accessible to Admins and CEOs.</div>
                </div>
            </div>
        );
    }

    // Leaderboard computation
    const leaderboard = agents.map(agent => {
        const stats = agentStats[agent.id] || {};
        const agentTasks = tasks.filter((t: any) =>
            (t.assignments || []).some((as: any) => as.agent_id === agent.id) || t.claimed_by_id === agent.id
        );
        const completed = agentTasks.filter((t: any) => t.status === 'completed').length;
        const total = agentTasks.length || 1;
        const overdueCount = agentTasks.filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()).length;
        const completionRate = Math.round((completed / total) * 100);
        const score = completionRate * 1.5 + completed * 2 - overdueCount * 5;
        return {
            ...agent,
            completed,
            total: agentTasks.length,
            overdue: overdueCount,
            completionRate,
            score: Math.max(0, Math.round(score)),
            pending: agentTasks.filter((t: any) => t.status === 'pending_approval').length,
            inProgress: agentTasks.filter((t: any) => t.status === 'in_progress').length,
            avgScore: stats.avg_performance_score || 0,
        };
    }).sort((a: any, b: any) => b.score - a.score);

    const overdueTasks = tasks.filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date());
    const completedTasks = tasks.filter((t: any) => t.status === 'completed');

    const teamChartData = leaderboard.map((a: any) => ({
        name: a.full_name?.split(' ')[0] || 'Agent',
        completed: a.completed,
        overdue: a.overdue,
        pending: a.pending,
    }));

    const topAgent = leaderboard[0];
    const radarData = topAgent ? [
        { metric: 'Completion', value: topAgent.completionRate },
        { metric: 'Activity', value: Math.min(100, topAgent.total * 5) },
        { metric: 'Speed', value: Math.max(0, 100 - topAgent.overdue * 20) },
        { metric: 'Quality', value: topAgent.avgScore || 70 },
        { metric: 'Volume', value: Math.min(100, topAgent.completed * 8) },
    ] : [];

    return (
        <div className="page-content animate-fade">
            {/* Header */}
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Accountability Board</div>
                    <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="status-dot active" />
                        Live · Updated {lastUpdated.toLocaleTimeString()} · {region === 'Global' ? 'All Regions' : region}
                    </div>
                </div>
                <div className="page-header-right">
                    <button className="btn btn-secondary btn-icon" onClick={load} title="Refresh">
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
                    </button>
                </div>
            </div>

            {/* Team KPI Row */}
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
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={16} color={color} />
                            </div>
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
                        fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                        textTransform: 'capitalize', marginBottom: '-1px',
                    }}>
                        {tab === 'leaderboard' ? '🏆 Leaderboard' : tab === 'tasks' ? '📋 Task Monitor' : '🚨 Alerts'}
                    </button>
                ))}
            </div>

            {activeTab === 'leaderboard' && (
                <>
                    {/* Podium Top 3 */}
                    {leaderboard.length >= 3 && (
                        <div style={{
                            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                            gap: 16, marginBottom: 32, padding: '24px 0 0',
                        }}>
                            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((agent: any, podiumPos: number) => {
                                const rank = podiumPos === 0 ? 2 : podiumPos === 1 ? 1 : 3;
                                const height = rank === 1 ? 130 : rank === 2 ? 100 : 80;
                                const medalColor = AWARD_COLORS[rank - 1];
                                const initials = agent?.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
                                const roleColor = ROLE_COLORS[agent?.role] || '#2563eb';
                                return (
                                    <div key={agent?.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{
                                                width: rank === 1 ? 56 : 46, height: rank === 1 ? 56 : 46,
                                                borderRadius: '50%', background: roleColor,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: rank === 1 ? '1rem' : '0.85rem', fontWeight: 700, color: '#fff',
                                                border: `3px solid ${medalColor}`,
                                                boxShadow: `0 0 0 3px ${medalColor}40`,
                                            }}>{initials}</div>
                                            <div style={{
                                                position: 'absolute', bottom: -6, right: -6,
                                                width: 22, height: 22, borderRadius: '50%',
                                                background: medalColor, color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.65rem', fontWeight: 800, border: '2px solid #fff',
                                            }}>
                                                {rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{agent?.full_name?.split(' ')[0]}</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: medalColor }}>{agent?.score} pts</div>
                                        </div>
                                        <div style={{
                                            width: 100, height, borderRadius: '8px 8px 0 0',
                                            background: `linear-gradient(135deg, ${medalColor}30, ${medalColor}15)`,
                                            border: `2px solid ${medalColor}40`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.2rem', fontWeight: 800, color: medalColor,
                                        }}>#{rank}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Charts */}
                    {teamChartData.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 24 }}>
                            <div className="chart-container">
                                <div className="section-header">
                                    <div className="section-title"><Target size={16} color="var(--accent)" /> Task Performance by Agent</div>
                                </div>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={teamChartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                        <Bar dataKey="completed" name="Completed" fill="#10b981" stackId="a" />
                                        <Bar dataKey="pending" name="Pending" fill="#3b82f6" stackId="a" />
                                        <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {topAgent && radarData.length > 0 && (
                                <div className="chart-container">
                                    <div className="section-header">
                                        <div className="section-title"><Award size={16} color="#f59e0b" /> Top Agent Profile</div>
                                    </div>
                                    <div style={{ textAlign: 'center', marginBottom: 4, fontSize: '0.8rem', fontWeight: 700 }}>{topAgent.full_name}</div>
                                    <ResponsiveContainer width="100%" height={170}>
                                        <RadarChart data={radarData}>
                                            <PolarGrid stroke="var(--border)" />
                                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                                            <Radar name="Performance" dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Leaderboard table */}
                    <div className="table-wrapper">
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                            <div className="section-title">Agent Leaderboard</div>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th><th>Agent</th><th>Completion Rate</th>
                                    <th>Completed</th><th>In Progress</th><th>Overdue</th><th>Score</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((agent: any, i: number) => {
                                    const roleColor = ROLE_COLORS[agent.role] || '#2563eb';
                                    const initials = agent.full_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
                                    return (
                                        <React.Fragment key={agent.id}>
                                            <tr style={{ background: expandedAgent === agent.id ? 'rgba(37,99,235,0.04)' : 'transparent' }}>
                                                <td>
                                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: i < 3 ? AWARD_COLORS[i] : 'var(--bg-tertiary)', color: i < 3 ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700 }}>{i + 1}</div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: roleColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{agent.full_name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{agent.region || 'Global'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ flex: 1, maxWidth: 100, height: 6, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                            <div style={{ width: `${agent.completionRate}%`, height: '100%', borderRadius: 99, background: agent.completionRate >= 80 ? '#10b981' : agent.completionRate >= 50 ? '#f59e0b' : '#ef4444', transition: 'width 0.8s ease' }} />
                                                        </div>
                                                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{agent.completionRate}%</span>
                                                    </div>
                                                </td>
                                                <td><span style={{ color: 'var(--success)', fontWeight: 700 }}>{agent.completed}</span></td>
                                                <td><span style={{ color: 'var(--info)', fontWeight: 600 }}>{agent.inProgress}</span></td>
                                                <td>
                                                    {agent.overdue > 0
                                                        ? <span className="badge badge-danger">{agent.overdue} overdue</span>
                                                        : <span className="badge badge-success">On track</span>}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Zap size={13} color={i < 3 ? AWARD_COLORS[i] : 'var(--text-muted)'} />
                                                        <span style={{ fontWeight: 700, color: i < 3 ? AWARD_COLORS[i] : 'var(--text-primary)' }}>{agent.score}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}>
                                                        {expandedAgent === agent.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedAgent === agent.id && (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '14px 20px', background: 'var(--bg-tertiary)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                                            {[
                                                                { label: 'Completed', value: agent.completed, color: '#10b981' },
                                                                { label: 'In Progress', value: agent.inProgress, color: '#3b82f6' },
                                                                { label: 'Overdue', value: agent.overdue, color: '#ef4444' },
                                                                { label: 'Score', value: agent.score, color: 'var(--accent)' },
                                                            ].map(x => (
                                                                <div key={x.label} style={{ textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: x.color }}>{x.value}</div>
                                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{x.label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {leaderboard.length === 0 && (
                                    <tr><td colSpan={8}><div className="empty-state">No agents found</div></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'tasks' && (
                <div className="table-wrapper">
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="section-title">All Tasks Monitor</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span className="badge badge-danger">{overdueTasks.length} overdue</span>
                            <span className="badge badge-gray">{tasks.length} total</span>
                        </div>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Task</th><th>Assigned Agent</th><th>Status</th>
                                <th>Priority</th><th>Due Date</th><th>Region</th><th>Overdue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.sort((a: any, b: any) => {
                                const aOv = a.status !== 'completed' && a.due_date && new Date(a.due_date) < new Date();
                                const bOv = b.status !== 'completed' && b.due_date && new Date(b.due_date) < new Date();
                                return (bOv ? 1 : 0) - (aOv ? 1 : 0);
                            }).slice(0, 50).map((t: any) => {
                                const isOv = t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date();
                                const agent = agents.find((a: any) => a.id === (t.claimed_by_id || t.assignments?.[0]?.agent_id));
                                return (
                                    <tr key={t.id} style={{ background: isOv ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                                        <td>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <div className={`priority-indicator priority-${t.priority || 'medium'}`} style={{ width: 3, height: 36, borderRadius: 99 }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }} className="truncate">{t.title}</div>
                                                    {t.description && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.description?.slice(0, 50)}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {agent ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: ROLE_COLORS[agent.role] || '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>
                                                        {agent.full_name?.charAt(0)}
                                                    </div>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{agent.full_name?.split(' ')[0]}</span>
                                                </div>
                                            ) : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unassigned</span>}
                                        </td>
                                        <td>
                                            <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'in_progress' ? 'badge-accent' : t.status === 'pending_approval' ? 'badge-warning' : 'badge-gray'}`}>
                                                {t.status?.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${t.priority === 'high' ? 'badge-danger' : t.priority === 'medium' ? 'badge-warning' : 'badge-gray'}`}>
                                                {t.priority || 'medium'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            {t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}
                                        </td>
                                        <td><span className="badge badge-info">{t.region || 'Global'}</span></td>
                                        <td>
                                            {isOv ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 600 }}>
                                                    <Timer size={12} />
                                                    {Math.floor((new Date().getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24))}d
                                                </div>
                                            ) : <span style={{ color: 'var(--success)', fontSize: '0.78rem' }}>✓</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'alerts' && (
                <div>
                    {alerts.length === 0 ? (
                        <div className="empty-state" style={{ padding: '60px' }}>
                            <div className="empty-state-icon">✅</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>All Clear!</div>
                            <div style={{ fontSize: '0.82rem' }}>No unresolved alerts at this time.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {alerts.map((alert: any) => (
                                <div key={alert.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', borderLeft: `4px solid var(--${alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'info'})` }}>
                                    <div style={{ fontSize: '1.4rem' }}>
                                        {alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 2 }}>{alert.title}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{alert.description}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                            <span className={`badge ${alert.severity === 'critical' ? 'badge-danger' : alert.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>{alert.severity}</span>
                                            {alert.region && <span className="badge badge-gray">{alert.region}</span>}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {alert.created_at ? new Date(alert.created_at).toLocaleDateString() : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
