import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    AreaChart, Area, BarChart, Bar,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Eye, Heart, Users, Share2, MousePointer, RefreshCw, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { metricsApi, postsApi, tasksApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface Props { region: string; }

const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0891b2', '#db2777'];
const PERIOD_OPTIONS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: '6M', days: 180 },
    { label: '1Y', days: 365 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#fff', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)',
            fontSize: '0.8rem',
        }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

export const AnalyticsHubView: React.FC<Props> = ({ region }) => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [metrics, setMetrics] = useState<any[]>([]);
    const [demographics, setDemographics] = useState<any[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [accountability, setAccountability] = useState<any[]>([]);
    const [period, setPeriod] = useState(30);
    const [activeTab, setActiveTab] = useState<'overview' | 'audience' | 'posts' | 'accountability'>('overview');
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const initialLoaded = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const regionParam = region === 'Global' ? undefined : region;
            const [mRes, dRes, pRes] = await Promise.all([
                metricsApi.page({ region: regionParam, days: period }),
                metricsApi.demographics({ region: regionParam }),
                postsApi.list({ region: regionParam, limit: 20 }),
            ]);
            setMetrics(mRes.data);
            setDemographics(dRes.data);
            setPosts(pRes.data);
            if (isAdmin) {
                try {
                    const acRes = await tasksApi.accountability(regionParam);
                    setAccountability(acRes.data);
                } catch { }
            }
            setLastUpdated(new Date());
        } catch { /* handle silently */ }
        if (!silent) setLoading(false);
    }, [region, period, isAdmin]);

    useEffect(() => {
        if (!initialLoaded.current) {
            initialLoaded.current = true;
            load(false);
        } else {
            load(false);
        }
        const t = setInterval(() => load(true), 30000);
        return () => clearInterval(t);
    }, [region, period]);

    // Process chart data
    const timelineData = metrics.reduce((acc: any[], m) => {
        const existing = acc.find(d => d.date === m.metric_date?.slice(5));
        if (existing) {
            existing.followers = (existing.followers || 0) + (m.followers || 0);
            existing.engagement = (existing.engagement || 0) + (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
            existing.impressions = (existing.impressions || 0) + (m.impressions || 0);
            existing.visitors = (existing.visitors || 0) + (m.visitors || 0);
        } else {
            acc.push({
                date: m.metric_date?.slice(5),
                followers: m.followers || 0,
                engagement: (m.likes || 0) + (m.comments || 0) + (m.shares || 0),
                impressions: m.impressions || 0,
                visitors: m.visitors || 0,
                likes: m.likes || 0,
                comments: m.comments || 0,
                shares: m.shares || 0,
                clicks: m.clicks || 0,
            });
        }
        return acc;
    }, []);

    // KPI totals
    const totalFollowers = metrics.length ? Math.max(...metrics.map(m => m.followers || 0)) : 0;
    const totalImpressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0);
    const totalEngagement = metrics.reduce((s, m) => s + (m.likes || 0) + (m.comments || 0) + (m.shares || 0), 0);
    const avgER = metrics.length ? (metrics.reduce((s, m) => s + (m.engagement_rate || 0), 0) / metrics.length).toFixed(2) : '0.00';
    const totalVisitors = metrics.reduce((s, m) => s + (m.visitors || 0), 0);
    const totalClicks = metrics.reduce((s, m) => s + (m.clicks || 0), 0);

    // Demographics by seniority
    const seniorityMap: Record<string, number> = {};
    demographics.forEach(d => {
        if (d.seniority) seniorityMap[d.seniority] = (seniorityMap[d.seniority] || 0) + (d.follower_count || 1);
    });
    const seniorityData = Object.entries(seniorityMap).map(([name, value]) => ({ name, value }));

    // Demographics by industry
    const industryMap: Record<string, number> = {};
    demographics.forEach(d => {
        if (d.industry) industryMap[d.industry] = (industryMap[d.industry] || 0) + (d.follower_count || 1);
    });
    const industryData = Object.entries(industryMap).slice(0, 8).map(([name, value]) => ({ name, value }));

    // Top posts
    const topPosts = [...posts].sort((a, b) => ((b.impressions || 0) + (b.likes || 0) * 5) - ((a.impressions || 0) + (a.likes || 0) * 5)).slice(0, 10);

    const KPICard = ({ icon: Icon, label, value, sub, trend, color }: any) => (
        <div className="stat-card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="stat-label">{label}</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={color} />
                </div>
            </div>
            <div className="stat-number">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            {trend !== undefined && (
                <div className={`stat-change ${trend >= 0 ? 'up' : 'down'}`}>
                    {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(trend)}% vs last period
                </div>
            )}
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
    );

    return (
        <div className="page-content animate-fade">
            {/* Page Header */}
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Analytics Hub</div>
                    <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="status-dot active" />
                        Live data · Updated {lastUpdated.toLocaleTimeString()} · {region === 'Global' ? 'All Regions' : region}
                    </div>
                </div>
                <div className="page-header-right">
                    {/* Period selector */}
                    <div className="tabs" style={{ width: 'auto' }}>
                        {PERIOD_OPTIONS.map(opt => (
                            <button key={opt.label} className={`tab ${period === opt.days ? 'active' : ''}`}
                                onClick={() => setPeriod(opt.days)} style={{ minWidth: 40 }}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button className="btn btn-secondary btn-icon" onClick={() => load(false)} title="Refresh">
                        <RefreshCw size={15} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
                    </button>
                </div>
            </div>

            {/* Tabs — role-aware */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {(['overview', 'audience', 'posts'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        padding: '10px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                        textTransform: 'capitalize', marginBottom: '-1px',
                    }}>
                        {tab === 'overview' ? 'Engagement Overview' : tab === 'audience' ? 'Audience Insights' : 'Post Performance'}
                    </button>
                ))}
                {isAdmin && (
                    <button onClick={() => setActiveTab('accountability')} style={{
                        padding: '10px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === 'accountability' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === 'accountability' ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'accountability' ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', marginBottom: '-1px',
                    }}>
                        Team Accountability
                    </button>
                )}
            </div>

            {/* KPI Cards */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                <KPICard icon={Users} label="Total Followers" value={totalFollowers} color="#2563eb" trend={3.2} />
                <KPICard icon={Eye} label="Total Impressions" value={totalImpressions} color="#7c3aed" sub={`${period} days`} />
                <KPICard icon={Heart} label="Total Engagement" value={totalEngagement} color="#10b981" trend={8.1} />
                <KPICard icon={TrendingUp} label="Avg Engagement Rate" value={`${avgER}%`} color="#f59e0b" />
            </div>

            {activeTab === 'overview' && (
                <>
                    {/* Follower Growth */}
                    <div className="chart-container" style={{ marginBottom: 20 }}>
                        <div className="section-header">
                            <div className="section-title"><TrendingUp size={16} color="var(--accent)" /> Follower Growth & Engagement</div>
                            <div className="badge badge-accent">{period}D Trend</div>
                        </div>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                <Area type="monotone" dataKey="followers" stroke="#2563eb" strokeWidth={2} fill="url(#colorFollowers)" name="Followers" />
                                <Area type="monotone" dataKey="engagement" stroke="#10b981" strokeWidth={2} fill="url(#colorEngagement)" name="Engagement" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Stats grid */}
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        {/* Impressions vs Visitors */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Eye size={16} color="var(--purple)" /> Impressions vs Page Visits</div>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={timelineData.slice(-14)} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                    <Bar dataKey="impressions" fill="#7c3aed" name="Impressions" radius={[3, 3, 0, 0]} opacity={0.85} />
                                    <Bar dataKey="visitors" fill="#0891b2" name="Visitors" radius={[3, 3, 0, 0]} opacity={0.85} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Engagement breakdown */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Heart size={16} color="#ef4444" /> Engagement Breakdown</div>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={timelineData.slice(-10)} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                    <Bar dataKey="likes" stackId="a" fill="#ef4444" name="Likes" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="comments" stackId="a" fill="#f59e0b" name="Comments" />
                                    <Bar dataKey="shares" stackId="a" fill="#10b981" name="Shares" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* More KPI stats */}
                    <div className="grid-4">
                        <div className="stat-card">
                            <div className="stat-label">Page Visitors</div>
                            <div className="stat-number">{totalVisitors.toLocaleString()}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Link Clicks</div>
                            <div className="stat-number">{totalClicks.toLocaleString()}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Posts Tracked</div>
                            <div className="stat-number">{posts.length}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Data Points</div>
                            <div className="stat-number">{metrics.length}</div>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'audience' && (
                <>
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        {/* Seniority Pie */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Users size={16} color="var(--accent)" /> Audience by Seniority</div>
                            </div>
                            {seniorityData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie data={seniorityData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                                            dataKey="value" nameKey="name" paddingAngle={3}>
                                            {seniorityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v: any) => [v.toLocaleString(), 'Followers']} />
                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="empty-state"><div className="empty-state-icon">📊</div>No demographic data yet</div>
                            )}
                        </div>

                        {/* Industry bar */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><BarChart2 size={16} color="var(--purple)" /> Audience by Industry</div>
                            </div>
                            {industryData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart layout="vertical" data={industryData} margin={{ top: 0, right: 30, bottom: 0, left: 80 }}>
                                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={75} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Followers">
                                            {industryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="empty-state"><div className="empty-state-icon">🏭</div>No industry data yet</div>
                            )}
                        </div>
                    </div>

                    {/* Demographics breakdown table */}
                    <div className="table-wrapper">
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="section-title">Audience Demographics Detail</div>
                            <span className="badge badge-gray">{demographics.length} segments</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Region</th>
                                        <th>Seniority</th>
                                        <th>Industry</th>
                                        <th>Function</th>
                                        <th>Company Size</th>
                                        <th>Followers</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {demographics.slice(0, 20).map((d, i) => (
                                        <tr key={d.id || i}>
                                            <td><span className="badge badge-info">{d.region || '—'}</span></td>
                                            <td><span style={{ fontSize: '0.82rem' }}>{d.seniority || '—'}</span></td>
                                            <td>{d.industry || '—'}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{d.function || '—'}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{d.company_size || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ flex: 1, maxWidth: 80, height: 4, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                        <div style={{ width: `${Math.min(100, ((d.follower_count || 0) / 500) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{(d.follower_count || 0).toLocaleString()}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'posts' && (
                <div className="table-wrapper">
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="section-title">Top Performing Posts</div>
                        <button className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                            <Download size={13} /> Export CSV
                        </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Post</th>
                                    <th>Status</th>
                                    <th>Region</th>
                                    <th>Type</th>
                                    <th><Heart size={12} style={{ verticalAlign: 'middle' }} /> Likes</th>
                                    <th><Eye size={12} style={{ verticalAlign: 'middle' }} /> Impressions</th>
                                    <th><Share2 size={12} style={{ verticalAlign: 'middle' }} /> Shares</th>
                                    <th><MousePointer size={12} style={{ verticalAlign: 'middle' }} /> Clicks</th>
                                    <th>Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topPosts.length === 0 ? (
                                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No posts data available</td></tr>
                                ) : topPosts.map((p, i) => {
                                    const score = ((p.likes || 0) * 5) + (p.impressions || 0) + (p.shares || 0) * 10;
                                    return (
                                        <tr key={p.id}>
                                            <td>
                                                <div style={{
                                                    width: 24, height: 24, borderRadius: '50%',
                                                    background: i < 3 ? ['#f59e0b', '#94a3b8', '#cd7c3c'][i] : 'var(--bg-tertiary)',
                                                    color: i < 3 ? '#fff' : 'var(--text-muted)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                                                }}>{i + 1}</div>
                                            </td>
                                            <td>
                                                <div style={{ maxWidth: 260, fontSize: '0.82rem', fontWeight: 600 }} className="truncate">{p.content?.slice(0, 80)}...</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</div>
                                            </td>
                                            <td>
                                                <span className={`badge ${p.status === 'published' ? 'badge-success' : p.status === 'draft' ? 'badge-gray' : 'badge-warning'}`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td><span className="badge badge-info">{p.region || 'Global'}</span></td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{p.post_type || 'post'}</td>
                                            <td style={{ fontWeight: 600 }}>{(p.likes || 0).toLocaleString()}</td>
                                            <td style={{ fontWeight: 600 }}>{(p.impressions || 0).toLocaleString()}</td>
                                            <td>{(p.shares || 0).toLocaleString()}</td>
                                            <td>{(p.clicks || 0).toLocaleString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 60, height: 4, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                        <div style={{ width: `${Math.min(100, score / 500)}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)' }}>{score}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {activeTab === 'accountability' && isAdmin && (
                <div>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Team Task Accountability</div>
                        {accountability.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">✅</div>
                                All tasks on track — no overdue items
                            </div>
                        ) : (
                            <div className="chart-container">
                                <div className="section-header">
                                    <div className="section-title"><AlertTriangle size={15} color="var(--danger)" /> Overdue / At-Risk Tasks</div>
                                    <span className="badge badge-danger">{accountability.length} items</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {accountability.map((item: any, i: number) => (
                                        <div key={i} style={{
                                            padding: '12px 16px', background: 'rgba(239,68,68,0.06)',
                                            borderRadius: 8, borderLeft: '3px solid var(--danger)',
                                            display: 'flex', alignItems: 'center', gap: 14,
                                        }}>
                                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>
                                                {item.agent_name?.charAt(0) || '?'}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.agent_name || 'Unknown Agent'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.task_title}</div>
                                            </div>
                                            {item.due_date && (
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 600 }}>Due: {new Date(item.due_date).toLocaleDateString()}</div>
                                                    <span className="badge badge-danger" style={{ fontSize: '0.6rem' }}>OVERDUE</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Completion summary by agent */}
                    <div className="chart-container">
                        <div className="section-title" style={{ marginBottom: 12 }}><CheckCircle size={15} color="var(--success)" /> Summary by Agent</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>View detailed per-agent breakdowns in the Agent Progress view →</div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Needed for import in route
function BarChart2({ size, color }: { size: number, color: string }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="18" y="3" width="4" height="18" rx="1" /><rect x="10" y="8" width="4" height="13" rx="1" /><rect x="2" y="13" width="4" height="8" rx="1" /></svg>;
}
