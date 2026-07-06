import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Award, CheckCircle, Clock, AlertTriangle, X, MessageSquare } from 'lucide-react';
import { usersApi, tasksApi, metricsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { User, Task, PageMetric } from '../types';
import { useNavigate } from 'react-router-dom';

interface AgentStats {
    tasks_completed: number;
    tasks_active: number;
    tasks_overdue: number;
    posts_published: number;
    avg_engagement: number;
    score: number;
}

const BADGE_THRESHOLDS = [
    { label: '🥇 Gold', minScore: 80, color: '#fbbf24' },
    { label: '🥈 Silver', minScore: 60, color: '#9ca3af' },
    { label: '🥉 Bronze', minScore: 40, color: '#d97706' },
    { label: '📋 Active', minScore: 0, color: 'var(--accent)' },
];

const getBadge = (score: number) => BADGE_THRESHOLDS.find(b => score >= b.minScore) || BADGE_THRESHOLDS[3];

// ── Agent Profile Drawer ───────────────────────────────────────────────────
const AgentDrawer: React.FC<{
    agent: User;
    stats: AgentStats;
    tasks: Task[];
    onClose: () => void;
    onMessage: (agentId: string) => void;
}> = ({ agent, stats, tasks, onClose, onMessage }) => {
    const badge = getBadge(stats.score);
    const agentTasks = tasks.filter(t => t.assignments?.some(as => as.agent_id === agent.id));
    const completionRate = agentTasks.length > 0
        ? Math.round((stats.tasks_completed / agentTasks.length) * 100)
        : 0;

    const taskStatusGroups = [
        { label: 'Completed', tasks: agentTasks.filter(t => t.status === 'completed'), color: 'var(--success)' },
        { label: 'Active', tasks: agentTasks.filter(t => ['active', 'in_progress'].includes(t.status)), color: 'var(--accent)' },
        { label: 'Overdue', tasks: agentTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'), color: 'var(--danger)' },
        { label: 'Pending Approval', tasks: agentTasks.filter(t => t.status === 'pending_approval'), color: 'var(--purple)' },
    ];

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 420, background: '#fff',
            borderLeft: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 1500,
            display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.22s ease',
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'var(--accent-glow)', border: '2px solid var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)',
                    }}>
                        {agent.full_name.charAt(0)}
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>{agent.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{agent.email}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                            <span className="badge badge-accent">{agent.role}</span>
                            {agent.region && <span className="badge badge-gray">{agent.region}</span>}
                            <span className="badge" style={{ background: `${badge.color}22`, color: badge.color }}>{badge.label}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Message this agent"
                        onClick={() => onMessage(agent.id)}
                    >
                        <MessageSquare size={15} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16 }}>
                {[
                    { label: 'Completed', value: stats.tasks_completed, color: 'var(--success)' },
                    { label: 'Active', value: stats.tasks_active, color: 'var(--accent)' },
                    { label: 'Overdue', value: stats.tasks_overdue, color: 'var(--danger)' },
                    { label: 'Score', value: stats.score, color: badge.color },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Completion progress bar */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    <span>Completion Rate</span>
                    <span style={{ color: 'var(--accent)' }}>{completionRate}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${completionRate}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
            </div>

            {/* Task history */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Task History ({agentTasks.length} total)
                </div>
                {taskStatusGroups.map(group => (
                    group.tasks.length > 0 && (
                        <div key={group.label} style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: group.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color }} />
                                {group.label} ({group.tasks.length})
                            </div>
                            {group.tasks.map(t => (
                                <div key={t.id} style={{
                                    padding: '8px 12px', marginBottom: 6,
                                    background: 'var(--bg-tertiary)', borderRadius: 8,
                                    borderLeft: `3px solid ${group.color}`,
                                }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t.title}</div>
                                    {t.due_date && (
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                            Due: {new Date(t.due_date).toLocaleDateString()}
                                        </div>
                                    )}
                                    {t.description && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                                            {t.description.slice(0, 80)}{t.description.length > 80 ? '...' : ''}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                ))}
                {agentTasks.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', fontSize: '0.85rem' }}>
                        No tasks assigned yet
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main View ──────────────────────────────────────────────────────────────
export const AgentProgressView: React.FC<{ region: string }> = ({ region }) => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin';
    const [agents, setAgents] = useState<User[]>([]);
    const [statsMap, setStatsMap] = useState<Record<string, AgentStats>>({});
    const [tasks, setTasks] = useState<Task[]>([]);
    const [metrics, setMetrics] = useState<PageMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<User | null>(null);
    const initialLoaded = useRef(false);

    const loadAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            if (isAdmin) {
                const [agRes, tRes, mRes] = await Promise.all([
                    usersApi.list({ role: 'agent', region: region === 'Global' ? undefined : region }),
                    tasksApi.list({ region: region === 'Global' ? undefined : region }),
                    metricsApi.page({ region: region === 'Global' ? undefined : region, days: 30 }),
                ]);
                const agentList: User[] = agRes.data;
                const allTasks: Task[] = tRes.data;
                setAgents(agentList);
                setTasks(allTasks);
                setMetrics(mRes.data);

                // Compute stats per agent
                const sMap: Record<string, AgentStats> = {};
                for (const a of agentList) {
                    const myTasks = allTasks.filter(t => t.assignments?.some(as => as.agent_id === a.id));
                    const done = myTasks.filter(t => t.status === 'completed').length;
                    const active = myTasks.filter(t => ['active', 'in_progress'].includes(t.status)).length;
                    const overdue = myTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length;
                    const score = Math.round(done * 10 - overdue * 15 + active * 3);
                    sMap[a.id] = { tasks_completed: done, tasks_active: active, tasks_overdue: overdue, posts_published: 0, avg_engagement: 0, score: Math.max(0, score) };
                }
                setStatsMap(sMap);
            } else {
                try {
                    const [tRes, sRes] = await Promise.all([
                        tasksApi.list({}),
                        usersApi.stats(user!.id),
                    ]);
                    setTasks(tRes.data);
                    setStatsMap({ [user!.id]: sRes.data });
                } catch { }
            }
        } catch { }
        if (!silent) setLoading(false);
    }, [region, isAdmin, user]);

    useEffect(() => {
        if (!initialLoaded.current) {
            initialLoaded.current = true;
            loadAll(false);
        } else {
            loadAll(false);
        }
        const interval = setInterval(() => loadAll(true), 30000);
        return () => clearInterval(interval);
    }, [region]);

    const leaderboard = agents
        .map(a => ({ ...a, ...statsMap[a.id] }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    const weeklyData = [
        { week: 'W1', completed: 12, active: 5, overdue: 2 },
        { week: 'W2', completed: 18, active: 8, overdue: 1 },
        { week: 'W3', completed: 22, active: 6, overdue: 3 },
        { week: 'W4', completed: tasks.filter(t => t.status === 'completed').length, active: tasks.filter(t => t.status === 'active').length, overdue: tasks.filter(t => t.status === 'overdue').length },
    ];

    const regionData = metrics.reduce((acc: any[], m) => {
        const existing = acc.find(d => d.region === m.region);
        if (existing) {
            existing.engagement += m.likes + m.comments + m.shares;
            existing.followers += m.followers_gained;
            existing.count += 1;
        } else {
            acc.push({ region: m.region, engagement: m.likes + m.comments + m.shares, followers: m.followers_gained, count: 1 });
        }
        return acc;
    }, []);

    if (loading) {
        return <div className="page-content"><div className="grid-auto">{[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160 }} />)}</div></div>;
    }

    const myStats = statsMap[user?.id || ''];

    return (
        <>
            {/* Agent Profile Drawer */}
            {selectedAgent && statsMap[selectedAgent.id] && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 1400 }}
                        onClick={() => setSelectedAgent(null)}
                    />
                    <AgentDrawer
                        agent={selectedAgent}
                        stats={statsMap[selectedAgent.id]}
                        tasks={tasks}
                        onClose={() => setSelectedAgent(null)}
                        onMessage={(id) => { setSelectedAgent(null); navigate(`/dashboard?chatWith=${id}`); }}
                    />
                </>
            )}

            <div className="page-content animate-fade" style={{ position: 'relative' }}>
                {/* ── Myself (agent view) ── */}
                {!isAdmin && myStats && (
                    <div>
                        <h2 style={{ marginBottom: 20 }}>My Performance 📊</h2>
                        <div className="grid-4" style={{ marginBottom: 20 }}>
                            {[
                                { label: 'Tasks Completed', value: myStats.tasks_completed, icon: CheckCircle, color: 'var(--success)' },
                                { label: 'Active Tasks', value: myStats.tasks_active, icon: Clock, color: 'var(--accent)' },
                                { label: 'Overdue', value: myStats.tasks_overdue, icon: AlertTriangle, color: 'var(--danger)' },
                                { label: 'Performance Score', value: myStats.score, icon: Award, color: 'var(--warning)' },
                            ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="glass-card glass-card-hover" style={{ padding: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon size={18} color={color} />
                                        </div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
                                    </div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{value}</div>
                                </div>
                            ))}
                        </div>

                        {/* My recent tasks */}
                        <div className="chart-container" style={{ marginBottom: 20 }}>
                            <div className="chart-title">📋 My Recent Tasks</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {tasks.filter(t => t.assignments?.some(as => as.agent_id === user?.id)).slice(0, 10).map(t => (
                                    <div key={t.id} className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.status === 'completed' ? 'var(--success)' : t.status === 'active' ? 'var(--accent)' : 'var(--danger)', flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{t.title}</div>
                                            {t.due_date && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Due: {new Date(t.due_date).toLocaleDateString()}</div>}
                                        </div>
                                        <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'active' ? 'badge-accent' : 'badge-danger'}`}>
                                            {t.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                ))}
                                {tasks.filter(t => t.assignments?.some(as => as.agent_id === user?.id)).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No tasks assigned to you yet</div>
                                )}
                            </div>
                        </div>

                        <div className="chart-container">
                            <div className="chart-title">🏅 Your Badge</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 8 }}>
                                <div style={{ fontSize: '2.5rem' }}>{getBadge(myStats.score).label.split(' ')[0]}</div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: getBadge(myStats.score).color }}>{getBadge(myStats.score).label}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Score: {myStats.score} pts</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Admin: Leaderboard + Charts ── */}
                {isAdmin && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h2>Agent Leaderboard 🏆</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="badge badge-muted">{leaderboard.length} agents · {region}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click an agent to view profile</span>
                            </div>
                        </div>

                        {/* Leaderboard table */}
                        <div className="chart-container" style={{ marginBottom: 20 }}>
                            <div className="chart-title">🥇 Performance Ranking</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {leaderboard.map((a, i) => {
                                    const badge = getBadge(a.score || 0);
                                    const completionRate = a.tasks_completed + a.tasks_active > 0
                                        ? Math.round((a.tasks_completed / (a.tasks_completed + a.tasks_active + (a.tasks_overdue || 0))) * 100)
                                        : 0;
                                    const isSelected = selectedAgent?.id === a.id;
                                    return (
                                        <div
                                            key={a.id}
                                            className="glass-card"
                                            style={{
                                                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14,
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                background: isSelected ? 'var(--accent-glow)' : undefined,
                                                border: isSelected ? '1px solid rgba(37,99,235,0.3)' : undefined,
                                                transform: isSelected ? 'translateY(-1px)' : undefined,
                                            }}
                                            onClick={() => setSelectedAgent(isSelected ? null : a)}
                                        >
                                            {/* Rank */}
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--accent-glow)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: i < 3 ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}>
                                                {i + 1}
                                            </div>

                                            {/* Avatar */}
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                                                {a.full_name.charAt(0)}
                                            </div>

                                            {/* Info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.full_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.region} · {a.email}</div>
                                            </div>

                                            {/* Stats */}
                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{a.tasks_completed || 0}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Done</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>{a.tasks_overdue || 0}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Overdue</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: badge.color }}>{a.score || 0}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Score</div>
                                                </div>
                                            </div>

                                            {/* Badge + Progress */}
                                            <div style={{ textAlign: 'right', minWidth: 80 }}>
                                                <div style={{ marginBottom: 4 }}><span className="badge" style={{ background: `${badge.color}22`, color: badge.color }}>{badge.label}</span></div>
                                                <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden', width: 80 }}>
                                                    <div style={{ height: '100%', width: `${completionRate}%`, background: 'var(--accent)' }} />
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{completionRate}% completion</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {leaderboard.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No agents found for this region</div>
                                )}
                            </div>
                        </div>

                        {/* Charts row */}
                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            <div className="chart-container">
                                <div className="chart-title">📅 Weekly Task Progress</div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={weeklyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="week" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                        <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="completed" name="Completed" fill="var(--success)" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="active" name="Active" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="overdue" name="Overdue" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="chart-container">
                                <div className="chart-title">🌍 Regional Engagement</div>
                                <ResponsiveContainer width="100%" height={200}>
                                    <RadarChart data={regionData}>
                                        <PolarGrid stroke="var(--border)" />
                                        <PolarAngleAxis dataKey="region" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                        <PolarRadiusAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                                        <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                        <Radar dataKey="engagement" name="Engagement" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} />
                                        <Radar dataKey="followers" name="Followers" stroke="var(--purple)" fill="var(--purple)" fillOpacity={0.2} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
