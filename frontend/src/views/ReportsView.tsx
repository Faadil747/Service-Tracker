import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    Sparkles, Send, Download, Users, CheckCircle, FileText, Activity,
    TrendingUp, Award, Lightbulb, Globe, RefreshCw,
} from 'lucide-react';
import { reportsApi } from '../services/api';
import toast from 'react-hot-toast';

interface Props { region: string; }

const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0891b2', '#db2777'];

const RANGES = [
    { value: 'all', label: 'All time' },
    { value: '12m', label: 'Last 12 months' },
    { value: '90d', label: 'Last 90 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '7d', label: 'Last 7 days' },
];

const SUGGESTED = [
    'Which post got the most engagement?',
    "What's our average engagement rate?",
    'How many posts did we publish this month?',
    'Suggest ways to improve our reach',
];

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

const RMONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-07-10" -> "Jul 10" for readable chart axes.
const fmtDay = (iso: string) => {
    const p = String(iso || '').split('-');
    if (p.length < 3) return iso;
    return `${RMONTHS[parseInt(p[1], 10) - 1] || ''} ${parseInt(p[2], 10)}`;
};

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: '0.8rem' }}>
            {label && <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>}
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.payload?.fill }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600 }}>{(p.value ?? 0).toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

export const ReportsView: React.FC<Props> = ({ region }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState('all');
    const [question, setQuestion] = useState('');
    const [asking, setAsking] = useState(false);
    const [answer, setAnswer] = useState<string | null>(null);
    const initialLoaded = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await reportsApi.summary({ range, region: region === 'Global' ? undefined : region });
            setData(res.data);
        } catch { /* keep last good data on transient poll errors */ }
        if (!silent) setLoading(false);
    }, [range, region]);

    // Realtime: recompute from live data every 10s so new posts/tasks/clicks show up.
    useEffect(() => {
        if (!initialLoaded.current) initialLoaded.current = true;
        load(false);
        const t = setInterval(() => load(true), 10000);
        return () => clearInterval(t);
    }, [load]);

    const handleAsk = async (q?: string) => {
        const query = (q ?? question).trim();
        if (!query) return;
        setAsking(true);
        setAnswer(null);
        try {
            const res = await reportsApi.ask({ question: query, range, region: region === 'Global' ? undefined : region });
            setAnswer(res.data.answer);
        } catch {
            setAnswer('Could not get an answer right now. Please try again.');
        }
        setAsking(false);
    };

    const handleExport = () => {
        if (!data) return;
        const rows: string[][] = [['Section', 'Metric', 'Value']];
        rows.push(['KPI', 'Total Followers', String(data.kpis.total_followers ?? 'n/a')]);
        rows.push(['KPI', 'Task Completion %', String(data.kpis.task_completion)]);
        rows.push(['KPI', 'Total Posts', String(data.kpis.total_posts)]);
        rows.push(['KPI', 'Total Engagements', String(data.kpis.total_engagements)]);
        data.publishing_volume.forEach((m: any) => rows.push(['Publishing volume', m.month, String(m.posts)]));
        rows.push(['Task breakdown', 'Completed', String(data.task_breakdown.completed)]);
        rows.push(['Task breakdown', 'In Progress', String(data.task_breakdown.in_progress)]);
        rows.push(['Task breakdown', 'Pending', String(data.task_breakdown.pending)]);
        data.region_performance.forEach((r: any) => rows.push(['Region', r.region, `${r.employees} emp / ${r.engagements} eng / avg ${r.avg}`]));
        data.leaderboard.forEach((l: any) => rows.push(['Leaderboard', l.name, `score ${l.score} · ${l.posts} posts`]));
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `report-${data.range}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report exported');
    };

    if (loading && !data) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
                <div className="spinner" style={{ width: 30, height: 30 }} />
            </div>
        );
    }

    const kpis = data?.kpis || {};
    const followers = num(kpis.total_followers);
    const trend = (data?.engagement_trend || []).map((t: any) => ({ ...t, label: fmtDay(t.date || t.day) }));
    const volume = data?.publishing_volume || [];
    const tb = data?.task_breakdown || { completed: 0, in_progress: 0, pending: 0 };
    const taskPie = [
        { name: 'Completed', value: tb.completed },
        { name: 'In Progress', value: tb.in_progress },
        { name: 'Pending', value: tb.pending },
    ];
    const taskColors = ['#10b981', '#f59e0b', '#94a3b8'];
    const regionPerf = data?.region_performance || [];
    const topPosts = data?.top_posts || [];
    const leaderboard = data?.leaderboard || [];
    const insights = data?.insights || [];
    const toneColor: Record<string, string> = { good: '#10b981', info: '#2563eb', warn: '#f59e0b', bad: '#ef4444' };

    const KPI = ({ icon: Icon, label, value, suffix, color }: any) => (
        <div className="stat-card animate-slide-up">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="stat-label">{label}</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={color} />
                </div>
            </div>
            <div className="stat-number" style={{ color: value === null ? 'var(--text-muted)' : color }}>
                {value === null ? '—' : value.toLocaleString()}{value !== null ? (suffix || '') : ''}
            </div>
        </div>
    );

    return (
        <div className="page-content animate-fade">
            {/* Header */}
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Reports</div>
                    <div className="page-subtitle">Data-driven insights and executive summary.</div>
                </div>
                <div className="page-header-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="select" style={{ width: 'auto', fontSize: '0.82rem' }} value={range} onChange={e => setRange(e.target.value)}>
                        {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button className="btn btn-secondary btn-icon btn-sm" onClick={() => load(false)} title="Refresh"><RefreshCw size={15} /></button>
                    <button className="btn btn-secondary" onClick={handleExport}><Download size={14} /> Export CSV</button>
                </div>
            </div>

            {/* Ask AI about your data */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(37,99,235,0.06))',
                border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 24,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--purple, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={16} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700 }}>Ask AI about your data</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Powered by DeepSeek</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        className="input"
                        placeholder="e.g. Which post performed best? What's our engagement trend? How many followers did we gain?"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAsk(); }}
                        style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={() => handleAsk()} disabled={asking}>
                        {asking ? <RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={14} />} Ask
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {SUGGESTED.map(s => (
                        <button key={s} onClick={() => { setQuestion(s); handleAsk(s); }} style={{
                            fontSize: '0.72rem', padding: '4px 10px', borderRadius: 99,
                            border: '1px solid var(--border)', background: 'var(--bg-secondary, #fff)',
                            color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit',
                        }}>{s}</button>
                    ))}
                </div>
                {answer && (
                    <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {answer}
                    </div>
                )}
            </div>

            {/* KPI cards */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                <KPI icon={Users} label="Total Followers" value={followers} color="#2563eb" />
                <KPI icon={CheckCircle} label="Task Completion" value={num(kpis.task_completion)} suffix="%" color="#10b981" />
                <KPI icon={FileText} label="Total Posts" value={num(kpis.total_posts)} color="#7c3aed" />
                <KPI icon={Activity} label="Total Engagements" value={num(kpis.total_engagements)} color="#f59e0b" />
            </div>

            {/* Engagement trend + Publishing volume */}
            <div className="grid-2" style={{ marginBottom: 20 }}>
                <div className="chart-container">
                    <div className="section-header">
                        <div className="section-title"><Activity size={16} color="var(--accent)" /> Engagement trend</div>
                        <span className="badge badge-gray">Last 14 days</span>
                    </div>
                    {trend.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={trend} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Line type="monotone" dataKey="engagements" stroke="#10b981" strokeWidth={2.5} dot={false} name="Engagements" />
                        </LineChart>
                    </ResponsiveContainer>
                    ) : (
                        <div className="empty-state" style={{ padding: 40 }}>
                            <div className="empty-state-icon">📈</div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Accumulating daily engagement</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto' }}>
                                A real data point is recorded each day LinkedIn syncs. The 14-day line fills in as days accumulate (no fabricated data).
                            </div>
                        </div>
                    )}
                </div>

                <div className="chart-container">
                    <div className="section-header">
                        <div className="section-title"><FileText size={16} color="var(--purple)" /> Publishing volume</div>
                        <span className="badge badge-gray">Posts per month</span>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={volume} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                            <Bar dataKey="posts" fill="#2563eb" radius={[4, 4, 0, 0]} name="Posts" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Task breakdown + Region performance */}
            <div className="grid-2" style={{ marginBottom: 20 }}>
                <div className="chart-container">
                    <div className="section-header">
                        <div className="section-title"><CheckCircle size={16} color="var(--success)" /> Task breakdown</div>
                    </div>
                    {(tb.completed + tb.in_progress + tb.pending) > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie data={taskPie} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" nameKey="name" paddingAngle={3}>
                                    {taskPie.map((_, i) => <Cell key={i} fill={taskColors[i]} />)}
                                </Pie>
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="empty-state" style={{ padding: 40 }}><div className="empty-state-icon">✅</div>No tasks yet</div>}
                </div>

                <div className="chart-container">
                    <div className="section-header">
                        <div className="section-title"><Globe size={16} color="var(--teal, #0891b2)" /> Region performance</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                        {regionPerf.map((r: any, i: number) => {
                            const maxEng = Math.max(...regionPerf.map((x: any) => x.engagements), 1);
                            return (
                                <div key={r.region} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 80, fontSize: '0.82rem', fontWeight: 600 }}>{r.region}</div>
                                    <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                        <div style={{ width: `${(r.engagements / maxEng) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 99 }} />
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', width: 150, textAlign: 'right' }}>
                                        {r.employees} emp · {r.engagements} eng · avg {r.avg}
                                    </div>
                                </div>
                            );
                        })}
                        {regionPerf.length === 0 && <div className="empty-state" style={{ padding: 30 }}>No region data</div>}
                    </div>
                </div>
            </div>

            {/* Top performing posts */}
            <div className="table-wrapper" style={{ marginBottom: 20 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-title"><TrendingUp size={16} color="var(--accent)" /> Top performing posts</div>
                </div>
                <table className="data-table">
                    <thead>
                        <tr><th>Post</th><th style={{ textAlign: 'right' }}>Likes</th><th style={{ textAlign: 'right' }}>Comments</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                    </thead>
                    <tbody>
                        {topPosts.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>No published posts yet</td></tr>
                        ) : topPosts.map((p: any) => (
                            <tr key={p.id}>
                                <td><div className="truncate" style={{ maxWidth: 620, fontSize: '0.82rem' }}>{p.content || '(no text)'}</div></td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.likes.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.comments.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.total.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Leaderboard */}
            <div className="chart-container" style={{ marginBottom: 20 }}>
                <div className="section-header">
                    <div className="section-title"><Award size={16} color="#f59e0b" /> Employee engagement leaderboard</div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Score = likes + comments×2 + shares×3</span>
                </div>
                {leaderboard.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '10px 2px' }}>No engagement data yet.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                        {leaderboard.map((l: any, i: number) => (
                            <div key={l.agent_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? COLORS[i] + '22' : 'var(--bg-tertiary)', color: i < 3 ? COLORS[i] : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700 }}>{i + 1}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{l.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{l.region} · {l.posts} post{l.posts !== 1 ? 's' : ''}</div>
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>{l.score.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Insights & recommendations */}
            <div>
                <div className="section-title" style={{ marginBottom: 12 }}><Lightbulb size={16} color="#f59e0b" /> Insights &amp; recommendations</div>
                <div className="grid-2">
                    {insights.map((ins: any, i: number) => (
                        <div key={i} className="card" style={{ borderLeft: `3px solid ${toneColor[ins.tone] || '#2563eb'}` }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, color: toneColor[ins.tone] || 'var(--text-primary)' }}>{ins.title}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ins.body}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
