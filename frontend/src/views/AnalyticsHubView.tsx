import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, Eye, Heart, Users, MousePointer, RefreshCw,
    MessageCircle, AlertTriangle, CheckCircle, ExternalLink, Lock
} from 'lucide-react';
import { metricsApi, tasksApi, settingsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface Props { region: string; }

const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0891b2', '#db2777'];

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

export const AnalyticsHubView: React.FC<Props> = ({ region }) => {
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
    const initialLoaded = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [oRes, dRes, pRes] = await Promise.all([
                metricsApi.linkedinOverview(),
                metricsApi.demographics(),
                metricsApi.linkedinPosts(15),
            ]);
            setOverview(oRes.data);
            setDemographics({ seniority: dRes.data.seniority || [], function: dRes.data.function || [] });
            setPosts(pRes.data.posts || []);
            setPostsMeta({ available: pRes.data.available, rate_limited: pRes.data.rate_limited, total: pRes.data.total });
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
        settingsApi.linkedinStatus()
            .then(r => setLinkedinConnected(r.data.connected))
            .catch(() => setLinkedinConnected(false));
    }, []);

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
    const followerSplit = (organic || paid)
        ? [{ name: 'Organic', value: organic || 0 }, { name: 'Paid', value: paid || 0 }].filter(d => d.value > 0)
        : [];

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
        <div className="page-content animate-fade">
            {/* Header */}
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

            {/* KPI Cards — all real, "—/syncing" when LinkedIn hasn't provided the value */}
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
                </>
            )}

            {activeTab === 'audience' && (
                <>
                    <div className="grid-2" style={{ marginBottom: 20 }}>
                        {/* Followers organic vs paid — real */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Users size={16} color="var(--accent)" /> Followers: Organic vs Paid</div>
                            </div>
                            {followerSplit.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie data={followerSplit} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                                            dataKey="value" nameKey="name" paddingAngle={3}>
                                            {followerSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyBlock icon={rateLimited ? '⏳' : '👥'} title={rateLimited ? 'Follower breakdown syncing' : 'No follower breakdown'}
                                note={rateLimited ? "LinkedIn's daily quota for follower statistics is reached — this fills in after 00:00 UTC." : 'Organic/paid follower split will appear here once LinkedIn returns it.'} />}
                        </div>

                        {/* Followers by seniority — real (only labels resolvable offline) */}
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><TrendingUp size={16} color="var(--purple)" /> Followers by Seniority</div>
                            </div>
                            {demographics.seniority.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart layout="vertical" data={demographics.seniority} margin={{ top: 0, right: 24, bottom: 0, left: 20 }}>
                                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={70} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Followers">
                                            {demographics.seniority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyBlock icon={rateLimited ? '⏳' : '📊'} title={rateLimited ? 'Demographics syncing' : 'No demographic data'}
                                note={rateLimited ? "LinkedIn's follower-statistics quota is reached for today — demographics fill in after 00:00 UTC." : 'Follower demographics will appear here once LinkedIn returns them.'} />}
                        </div>
                    </div>

                    {/* Followers by function — real */}
                    <div className="chart-container">
                        <div className="section-header">
                            <div className="section-title"><Users size={16} color="var(--accent)" /> Followers by Job Function</div>
                        </div>
                        {demographics.function.length > 0 ? (
                            <ResponsiveContainer width="100%" height={Math.max(240, demographics.function.length * 34)}>
                                <BarChart layout="vertical" data={demographics.function} margin={{ top: 0, right: 24, bottom: 0, left: 40 }}>
                                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={130} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-glow)' }} />
                                    <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Followers" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <EmptyBlock icon={rateLimited ? '⏳' : '🏢'} title={rateLimited ? 'Function breakdown syncing' : 'No function data'}
                            note={rateLimited ? 'Fills in after LinkedIn\'s daily quota resets (00:00 UTC).' : 'Follower job-function breakdown will appear here once LinkedIn returns it.'} />}
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
