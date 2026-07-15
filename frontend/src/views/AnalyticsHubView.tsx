import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';
import {
    TrendingUp, Eye, Heart, Users, MousePointer, RefreshCw,
    MessageCircle, AlertTriangle, CheckCircle, ExternalLink, Lock
} from 'lucide-react';
import { metricsApi, tasksApi, settingsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface Props { region: string; embedded?: boolean }

const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0891b2', '#db2777'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-07-10" -> "Jul 10" (readable X-axis labels instead of "07-10").
const fmtDay = (iso: string) => {
    const p = String(iso || '').split('-');
    if (p.length < 3) return iso;
    return `${MONTHS[parseInt(p[1], 10) - 1] || ''} ${parseInt(p[2], 10)}`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--bg-secondary, #fff)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: '0.8rem',
        }}>
            {label && <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>}
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.payload?.fill }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.value?.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

// A metric value that is honest about missing data (throttled / not yet synced).
const fmt = (v: any) => (v === null || v === undefined) ? null : Number(v);

export const AnalyticsHubView: React.FC<Props> = ({ region, embedded = false }) => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [overview, setOverview] = useState<any>(null);
    const [demographics, setDemographics] = useState<{ seniority: any[]; function: any[] }>({ seniority: [], function: [] });
    const [posts, setPosts] = useState<any[]>([]);
    const [postsMeta, setPostsMeta] = useState<{ available: boolean; rate_limited?: boolean; total?: number }>({ available: false });
    const [accountability, setAccountability] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'audience' | 'posts' | 'accountability'>('overview');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);
    const [dailyTrend, setDailyTrend] = useState<any>(null);
    const initialLoaded = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [oRes, dRes, pRes, tRes] = await Promise.all([
                metricsApi.linkedinOverview(),
                metricsApi.demographics(),
                metricsApi.linkedinPosts(15),
                metricsApi.dailyTrend(14),
            ]);
            setOverview(oRes.data);
            setDemographics({ seniority: dRes.data.seniority || [], function: dRes.data.function || [] });
            setPosts(pRes.data.posts || []);
            setPostsMeta({ available: pRes.data.available, rate_limited: pRes.data.rate_limited, total: pRes.data.total });
            setDailyTrend(tRes.data);
            if (isAdmin) {
                try {
                    const acRes = await tasksApi.accountability(region === 'Global' ? undefined : region);
                    setAccountability(acRes.data);
                } catch { /* non-fatal */ }
            }
        } catch { /* handle silently on polls */ }
        if (!silent) setLoading(false);
    }, [region, isAdmin]);

    useEffect(() => {
        if (!initialLoaded.current) initialLoaded.current = true;
        load(false);
        // LinkedIn analytics update at most daily and are day-throttled; poll gently.
        const t = setInterval(() => load(true), 5 * 60 * 1000);
        return () => clearInterval(t);
    }, [region, load]);

    useEffect(() => {
        // Skip when embedded in the combined dashboard — the parent already
        // checks LinkedIn status, so we avoid a duplicate introspection call.
        if (embedded) return;
        settingsApi.linkedinStatus()
            .then(r => setLinkedinConnected(r.data.connected))
            .catch(() => setLinkedinConnected(false));
    }, [embedded]);

    const handleForceSync = async () => {
        setSyncing(true);
        try {
            await metricsApi.syncPage();
            await load(true);
            toast.success('Synced latest data from LinkedIn');
        } catch {
            toast.error('Sync failed — LinkedIn may be rate-limited');
        }
        setSyncing(false);
    };

    const meta = overview?._meta || {};
    const available = meta.available;
    const rateLimited = meta.rate_limited;
    const tokenExpired = meta.token_expired;
    const staleFields: string[] = meta.stale_fields || [];

    // Real KPI values (null when LinkedIn hasn't provided them yet).
    const followers = fmt(overview?.followers);
    const impressions = fmt(overview?.impressions);
    const uniqueImpr = fmt(overview?.unique_impressions);
    const clicks = fmt(overview?.clicks);
    const likes = fmt(overview?.likes);
    const comments = fmt(overview?.comments);
    const shares = fmt(overview?.shares);
    const engagementRate = fmt(overview?.engagement_rate);
    const visitors = fmt(overview?.visitors);
    const organic = fmt(overview?.organic_followers);
    const paid = fmt(overview?.paid_followers);

    // Real aggregate breakdowns (lifetime page totals — not fabricated time-series).
    const engagementMix = [
        { name: 'Reactions', value: likes || 0 },
        { name: 'Comments', value: comments || 0 },
        { name: 'Shares', value: shares || 0 },
    ].filter(d => d.value > 0);
    const reachFunnel = [
        { name: 'Impressions', value: impressions || 0 },
        { name: 'Unique reach', value: uniqueImpr || 0 },
        { name: 'Clicks', value: clicks || 0 },
    ].filter(d => d.value > 0);

    // Real 14-day daily deltas, accumulated from our own snapshots (LinkedIn has
    // no historical API). Sparse until enough days are recorded — never faked.
    const trendRows: any[] = dailyTrend?.trend || [];
    const trendDeltas: any[] = [];
    for (let i = 1; i < trendRows.length; i++) {
        const prev = trendRows[i - 1];
        const curr = trendRows[i];
        const fd = curr.followers - prev.followers;

        // Prevent huge spikes from 0 baseline (first snapshot sync).
        // If the previous snapshot had 0, treat delta as 0.
        const impressionsDelta = (prev.impressions > 0 && curr.impressions > 0)
            ? Math.max(0, curr.impressions - prev.impressions)
            : 0;

        const engagementDelta = (prev.engagement > 0 && curr.engagement > 0)
            ? Math.max(0, curr.engagement - prev.engagement)
            : 0;

        trendDeltas.push({
            day: fmtDay(curr.date),
            gained: Math.max(0, fd),
            lost: Math.abs(Math.min(0, fd)),
            engagement: engagementDelta,
            impressions: impressionsDelta,
        });
    }
    const hasTrend = trendDeltas.length >= 1;

    const TrendChart = ({ title, keyName, color, sub }: { title: string; keyName: string; color: string; sub: string }) => (
        <div className="chart-container">
            <div className="section-header">
                <div className="section-title">{title}</div>
                <span className="badge badge-gray">14-day</span>
            </div>
            {hasTrend ? (
                <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={trendDeltas} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                        <Bar dataKey={keyName} fill={color} radius={[4, 4, 0, 0]} name={title} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <EmptyBlock icon="📅" title="Accumulating daily trend"
                    note={`${sub} A real point is recorded each day you Sync; ${dailyTrend?.snapshot_count || 0} day(s) captured so far.`} />
            )}
        </div>
    );

    // Professional horizontal demographic bar — sorted, top-N, gradient fill,
    // value labels at the bar end, compact rows. Replaces the tall raw bar list.
    const DemoBar = ({ data, gradId, from, to, topN = 12 }: { data: any[]; gradId: string; from: string; to: string; topN?: number }) => {
        const rows = [...data].sort((a, b) => b.value - a.value).slice(0, topN);
        const h = Math.max(200, rows.length * 30 + 16);
        return (
            <ResponsiveContainer width="100%" height={h}>
                <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 58, bottom: 2, left: 6 }} barCategoryGap={8}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={from} />
                            <stop offset="100%" stopColor={to} />
                        </linearGradient>
                    </defs>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={142} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                    <Bar dataKey="value" fill={`url(#${gradId})`} radius={[0, 5, 5, 0]} barSize={15} name="Followers">
                        <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString()} style={{ fontSize: 10.5, fontWeight: 600, fill: 'var(--text-muted)' }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const KPICard = ({ icon: Icon, label, value, suffix, sub, color }: any) => (
        <div className="stat-card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="stat-label">{label}</span>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={color} />
                </div>
            </div>
            {value === null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="stat-number" style={{ color: 'var(--text-muted)' }}>—</div>
                    <span className="badge badge-warning" style={{ fontSize: '0.6rem' }}>syncing</span>
                </div>
            ) : (
                <div className="stat-number">{value.toLocaleString()}{suffix || ''}</div>
            )}
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
    );

    const EmptyBlock = ({ icon, title, note }: { icon: string; title: string; note: string }) => (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-state-icon">{icon}</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto' }}>{note}</div>
        </div>
    );

    return (
        <div className={embedded ? 'animate-fade' : 'page-content animate-fade'}>
            {/* Header — hidden when embedded in the combined dashboard */}
            {!embedded && (
                <div className="page-header">
                    <div className="page-header-left">
                        <div className="page-title">Analytics Hub</div>
                        <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div className={`status-dot ${linkedinConnected && available ? 'active' : 'inactive'}`} />
                            {linkedinConnected === false
                                ? <span style={{ color: '#ef4444', fontWeight: 600 }}>LinkedIn not connected — check Settings</span>
                                : !available
                                    ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Waiting for first LinkedIn sync…</span>
                                    : <>Live LinkedIn data{meta.org_id ? ` · Org ${meta.org_id}` : ''}{meta.last_updated ? ` · Updated ${new Date(meta.last_updated).toLocaleString()}` : ''}</>
                            }
                        </div>
                    </div>
                    <div className="page-header-right">
                        <button className="btn btn-secondary btn-icon" onClick={handleForceSync} title="Force refresh from LinkedIn" disabled={syncing}>
                            <RefreshCw size={15} style={{ animation: (loading || syncing) ? 'spin 0.7s linear infinite' : 'none' }} />
                        </button>
                    </div>
                </div>
            )}

            {/* Token expiry — the integration keeps serving last-known data but needs reconnecting */}
            {tokenExpired && (
                <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.8rem',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0 }} />
                    <span>
                        The LinkedIn access token has expired — showing the last synced data. Add a
                        LINKEDIN_REFRESH_TOKEN to auto-renew it, or reconnect LinkedIn in Settings.
                    </span>
                </div>
            )}

            {/* Rate-limit / staleness notice — honest about what's live vs pending */}
            {available && rateLimited && (
                <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.8rem',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <AlertTriangle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
                    <span>
                        LinkedIn's daily quota for follower &amp; visitor counts is reached — those tiles fill in
                        after the quota resets (00:00 UTC). Engagement totals below are live.
                        {staleFields.length > 0 && ` Showing last-known values for: ${staleFields.join(', ')}.`}
                    </span>
                </div>
            )}

            {/* Tabs */}
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
                        {tab === 'overview' ? 'Engagement Overview' : tab === 'audience' ? 'Audience Insights' : 'Company Posts'}
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

            {/* KPI Cards — hidden when embedded (the combined dashboard shows its own) */}
            {!embedded && (
                <>
                    <div className="grid-4" style={{ marginBottom: 16 }}>
                        <KPICard icon={Users} label="Total Followers" value={followers} color="#2563eb"
                            sub={organic !== null ? `${(organic || 0).toLocaleString()} organic · ${(paid || 0).toLocaleString()} paid` : 'Total page followers'} />
                        <KPICard icon={Eye} label="Impressions" value={impressions} color="#7c3aed" sub="Lifetime page impressions" />
                        <KPICard icon={TrendingUp} label="Unique Reach" value={uniqueImpr} color="#0891b2" sub="Unique impressions" />
                        <KPICard icon={Heart} label="Engagement Rate" value={engagementRate} suffix="%" color="#f59e0b" sub="Across all page content" />
                    </div>
                    <div className="grid-4" style={{ marginBottom: 24 }}>
                        <KPICard icon={MousePointer} label="Clicks" value={clicks} color="#10b981" sub="Lifetime post clicks" />
                        <KPICard icon={Heart} label="Reactions" value={likes} color="#ef4444" sub="Total reactions" />
                        <KPICard icon={MessageCircle} label="Comments" value={comments} color="#db2777" sub="Total comments" />
                        <KPICard icon={Eye} label="Page Visitors" value={visitors} color="#6366f1" sub="Unique page visits" />
                    </div>
                </>
            )}

            {activeTab === 'overview' && (
                <>
                    {reachFunnel.length === 0 && engagementMix.length === 0 ? (
                        <div className="chart-container">
                            <EmptyBlock icon="⏳" title={available ? 'No engagement recorded yet' : 'Waiting for first LinkedIn sync'}
                                note="Company-page engagement totals will appear here once LinkedIn returns data for this organization." />
                        </div>
                    ) : (
                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            {/* Reach funnel — real lifetime totals */}
                            <div className="chart-container">
                                <div className="section-header">
                                    <div className="section-title"><Eye size={16} color="var(--purple)" /> Reach &amp; Clicks</div>
                                    <span className="badge badge-gray">Lifetime</span>
                                </div>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={reachFunnel} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Count">
                                            {reachFunnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Engagement mix — real */}
                            <div className="chart-container">
                                <div className="section-header">
                                    <div className="section-title"><Heart size={16} color="#ef4444" /> Engagement Mix</div>
                                    <span className="badge badge-gray">Lifetime</span>
                                </div>
                                {engagementMix.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <PieChart>
                                            <Pie data={engagementMix} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                                                dataKey="value" nameKey="name" paddingAngle={3}>
                                                {engagementMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : <EmptyBlock icon="💬" title="No engagement yet" note="Reactions, comments and shares will appear here." />}
                            </div>
                        </div>
                    )}

                    {/* Real 14-day daily engagement/impression trend — accumulated from our snapshots */}
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        <TrendChart title="Daily Engagement" keyName="engagement" color="#10b981" sub="Reactions + comments + shares gained each day." />
                        <TrendChart title="Daily Impressions" keyName="impressions" color="#7c3aed" sub="New impressions gained each day." />
                    </div>
                </>
            )}

            {activeTab === 'audience' && (
                <>
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        {/* Followers: Organic vs Paid — donut + clear labelled split
                            (stays readable even when the page is ~100% organic). */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Users size={16} color="var(--accent)" /> Followers: Organic vs Paid</div>
                            </div>
                            {(organic !== null || paid !== null) ? (() => {
                                const org = organic || 0, pd = paid || 0, tot = org + pd || 1;
                                const orgPct = Math.round(org / tot * 1000) / 10;
                                const pdPct = Math.round(pd / tot * 1000) / 10;
                                const pie = [{ name: 'Organic', value: org }, { name: 'Paid', value: pd }].filter(d => d.value > 0);
                                return (
                                    <div>
                                        <div style={{ position: 'relative' }}>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <PieChart>
                                                    <Pie data={pie} cx="50%" cy="50%" innerRadius={66} outerRadius={92} dataKey="value" nameKey="name" paddingAngle={pie.length > 1 ? 2 : 0} stroke="none">
                                                        {pie.map(d => <Cell key={d.name} fill={d.name === 'Organic' ? '#4f46e5' : '#10b981'} />)}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div style={{ position: 'absolute', inset: 0, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{tot.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>total followers</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4f46e5' }} /> ORGANIC</div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 3 }}>{org.toLocaleString()} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>· {orgPct}%</span></div>
                                            </div>
                                            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> PAID</div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 3 }}>{pd.toLocaleString()} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>· {pdPct}%</span></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : <EmptyBlock icon={rateLimited ? '⏳' : '👥'} title={rateLimited ? 'Follower breakdown syncing' : 'No follower breakdown'}
                                note={rateLimited ? "LinkedIn's daily quota for follower statistics is reached — this fills in after 00:00 UTC." : 'Organic/paid follower split will appear here once LinkedIn returns it.'} />}
                        </div>

                        {/* Followers by seniority — professional top list */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><TrendingUp size={16} color="var(--purple)" /> Followers by Seniority</div>
                            </div>
                            {demographics.seniority.length > 0
                                ? <DemoBar data={demographics.seniority} gradId="senGrad" from="#7c3aed" to="#a78bfa" topN={10} />
                                : <EmptyBlock icon={rateLimited ? '⏳' : '📊'} title={rateLimited ? 'Demographics syncing' : 'No demographic data'}
                                    note={rateLimited ? "LinkedIn's follower-statistics quota is reached for today — demographics fill in after 00:00 UTC." : 'Follower demographics will appear here once LinkedIn returns them.'} />}
                        </div>
                    </div>

                    {/* Followers by job function — professional top 12 */}
                    <div className="chart-container">
                        <div className="section-header">
                            <div className="section-title"><Users size={16} color="var(--accent)" /> Followers by Job Function</div>
                            {demographics.function.length > 12 && <span className="badge badge-gray">Top 12 of {demographics.function.length}</span>}
                        </div>
                        {demographics.function.length > 0
                            ? <DemoBar data={demographics.function} gradId="funGrad" from="#4f46e5" to="#818cf8" topN={12} />
                            : <EmptyBlock icon={rateLimited ? '⏳' : '🏢'} title={rateLimited ? 'Function breakdown syncing' : 'No function data'}
                                note={rateLimited ? 'Fills in after LinkedIn\'s daily quota resets (00:00 UTC).' : 'Follower job-function breakdown will appear here once LinkedIn returns it.'} />}
                    </div>

                    {/* Real 14-day follower growth — gained vs lost each day, from our snapshots */}
                    <div className="chart-container" style={{ marginTop: 20 }}>
                        <div className="section-header">
                            <div className="section-title"><TrendingUp size={16} color="var(--success)" /> Follower Growth — Gained vs Lost</div>
                            <span className="badge badge-gray">Last 14 days</span>
                        </div>
                        {hasTrend ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={trendDeltas} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                    <Bar dataKey="gained" fill="#10b981" radius={[3, 3, 0, 0]} name="Gained" />
                                    <Bar dataKey="lost" fill="#ef4444" radius={[3, 3, 0, 0]} name="Lost" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <EmptyBlock icon="📅" title="Accumulating follower growth"
                            note={`Daily follower gains/losses are recorded each time you Sync. ${dailyTrend?.snapshot_count || 0} day(s) captured so far — the chart fills in day by day.`} />}
                    </div>
                </>
            )}

            {activeTab === 'posts' && (
                <div className="table-wrapper">
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div className="section-title">Recent Company Posts {postsMeta.total ? <span className="badge badge-gray" style={{ marginLeft: 8 }}>{postsMeta.total.toLocaleString()} total</span> : null}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <Lock size={12} /> Per-post metrics unavailable via LinkedIn API
                        </div>
                    </div>
                    {posts.length === 0 ? (
                        <EmptyBlock icon={postsMeta.rate_limited ? '⏳' : '📝'} title={postsMeta.rate_limited ? 'Posts syncing' : 'No posts found'}
                            note={postsMeta.rate_limited ? 'LinkedIn is rate-limited right now — recent posts will load shortly.' : 'Recent posts published on the company page will appear here.'} />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {posts.map((p, i) => (
                                <div key={p.urn || i} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {(p.content || '(no text)').replace(/\\([@#()])/g, '$1')}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
                                            {p.published_at && <span>{new Date(p.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
                                            {p.has_media && <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>media</span>}
                                            {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 600 }}>View on LinkedIn <ExternalLink size={11} /></a>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'accountability' && isAdmin && (
                <div>
                    {accountability.length === 0 ? (
                        <div className="empty-state"><div className="empty-state-icon">✅</div>All tasks on track — no overdue items</div>
                    ) : (
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><AlertTriangle size={15} color="var(--danger)" /> Overdue / At-Risk Tasks</div>
                                <span className="badge badge-danger">{accountability.length} items</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {accountability.map((item: any, i: number) => (
                                    <div key={i} style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid var(--danger)', display: 'flex', alignItems: 'center', gap: 14 }}>
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
                    <div className="chart-container" style={{ marginTop: 16 }}>
                        <div className="section-title" style={{ marginBottom: 12 }}><CheckCircle size={15} color="var(--success)" /> Summary by Agent</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: 20 }}>View detailed per-agent breakdowns in the Agent Progress view →</div>
                    </div>
                </div>
            )}
        </div>
    );
};
