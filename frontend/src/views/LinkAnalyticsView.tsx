import React, { useEffect, useState, useCallback } from 'react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import {
    Link2, TrendingUp, MousePointer, Globe, Copy, Plus,
    ExternalLink, Download, RefreshCw, X, Activity
} from 'lucide-react';
import { linksApi } from '../services/api';
import toast from 'react-hot-toast';

interface Props { region: string; }

const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#0891b2'];

const PERIODS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: '6M', days: 180 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600 }}>{(p.value || 0).toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
};

export const LinkAnalyticsView: React.FC<Props> = ({ region }) => {
    const [links, setLinks] = useState<any[]>([]);
    const [clicks, setClicks] = useState<any[]>([]);
    const [_loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);
    const [activeTab, setActiveTab] = useState<'overview' | 'links' | 'campaigns'>('overview');
    const [showCreate, setShowCreate] = useState(false);
    const [newLink, setNewLink] = useState({
        original_url: '', utm_campaign: '', utm_source: 'linkedin',
        utm_medium: 'social', utm_content: '', region: region,
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [lRes, cRes] = await Promise.all([
                linksApi.list({ region: region === 'Global' ? undefined : region }),
                linksApi.clicks({ region: region === 'Global' ? undefined : region, days: period }),
            ]);
            setLinks(lRes.data);
            setClicks(cRes.data);
        } catch { }
        setLoading(false);
    }, [region, period]);

    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

    const totalClicks = links.reduce((s, l) => s + (l.total_clicks || 0), 0);
    const totalLinks = links.length;
    const avgCTR = links.length ? (links.reduce((s, l) => s + (l.ctr || 0), 0) / links.length).toFixed(2) : '0.00';
    const topRegion = (() => {
        const map: Record<string, number> = {};
        clicks.forEach(c => { if (c.country) map[c.country] = (map[c.country] || 0) + (c.click_count || 0); });
        return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    })();

    // Timeline data
    const timelineData: Record<string, { date: string; clicks: number; unique: number }> = {};
    clicks.forEach(c => {
        const d = c.clicked_at?.slice(0, 10);
        if (!d) return;
        if (!timelineData[d]) timelineData[d] = { date: d.slice(5), clicks: 0, unique: 0 };
        timelineData[d].clicks += c.click_count || 1;
        timelineData[d].unique += c.unique_count || 0;
    });
    const timelineArr = Object.values(timelineData).sort((a, b) => a.date.localeCompare(b.date));

    // Country breakdown
    const countryMap: Record<string, number> = {};
    clicks.forEach(c => { if (c.country) countryMap[c.country] = (countryMap[c.country] || 0) + (c.click_count || 0); });
    const countryData = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

    // Campaign breakdown
    const campaignMap: Record<string, number> = {};
    links.forEach(l => {
        if (l.utm_campaign) campaignMap[l.utm_campaign] = (campaignMap[l.utm_campaign] || 0) + (l.total_clicks || 0);
    });
    const campaignData = Object.entries(campaignMap).map(([name, value]) => ({ name, value }));

    const handleCopy = (url: string) => { navigator.clipboard.writeText(url).then(() => toast.success('Copied!')); };

    const handleCreate = async () => {
        if (!newLink.original_url.trim()) { toast.error('URL is required'); return; }
        try {
            await linksApi.create({
                ...newLink,
                region: region === 'Global' ? 'Global' : region,
            });
            toast.success('Tracking link created!');
            setShowCreate(false);
            setNewLink({ original_url: '', utm_campaign: '', utm_source: 'linkedin', utm_medium: 'social', utm_content: '', region });
            load();
        } catch { toast.error('Failed to create link'); }
    };

    return (
        <div className="page-content animate-fade">
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Link Analytics</div>
                    <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="status-dot active" />
                        Real-time tracking · {region === 'Global' ? 'All Regions' : region}
                    </div>
                </div>
                <div className="page-header-right">
                    <div className="tabs" style={{ width: 'auto' }}>
                        {PERIODS.map(p => (
                            <button key={p.label} className={`tab ${period === p.days ? 'active' : ''}`} onClick={() => setPeriod(p.days)} style={{ minWidth: 44 }}>{p.label}</button>
                        ))}
                    </div>
                    <button className="btn btn-secondary btn-icon" onClick={load} title="Refresh"><RefreshCw size={15} /></button>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        <Plus size={15} /> Create Link
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {(['overview', 'links', 'campaigns'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        padding: '10px 20px', background: 'transparent', border: 'none',
                        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                        textTransform: 'capitalize', marginBottom: '-1px',
                    }}>
                        {tab === 'overview' ? 'Click Analytics' : tab === 'links' ? 'Tracked Links' : 'Campaigns'}
                    </button>
                ))}
            </div>

            {/* KPI cards */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
                {[
                    { label: 'Total Links', value: totalLinks, icon: Link2, color: '#2563eb' },
                    { label: 'Total Clicks', value: totalClicks, icon: MousePointer, color: '#7c3aed' },
                    { label: 'Top Region', value: topRegion, icon: Globe, color: '#10b981' },
                    { label: 'Avg CTR', value: `${avgCTR}%`, icon: TrendingUp, color: '#f59e0b' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="stat-card animate-slide-up">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <span className="stat-label">{label}</span>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Icon size={16} color={color} />
                            </div>
                        </div>
                        <div className="stat-number">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                    </div>
                ))}
            </div>

            {activeTab === 'overview' && (
                <>
                    <div className="chart-container" style={{ marginBottom: 20 }}>
                        <div className="section-header">
                            <div className="section-title"><Activity size={16} color="var(--accent)" /> Click Timeline</div>
                            <span className="badge badge-accent">{period}D</span>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={timelineArr} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                <Line type="monotone" dataKey="clicks" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Clicks" />
                                <Line type="monotone" dataKey="unique" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 4" name="Unique" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid-2">
                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Globe size={16} color="var(--purple)" /> Clicks by Country</div>
                            </div>
                            {countryData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart layout="vertical" data={countryData} margin={{ top: 0, right: 30, bottom: 0, left: 60 }}>
                                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={55} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} name="Clicks">
                                            {countryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <div className="empty-state"><div className="empty-state-icon">🌍</div>No geo data yet</div>}
                        </div>

                        <div className="chart-container">
                            <div className="section-header">
                                <div className="section-title"><Link2 size={16} color="var(--teal)" /> Clicks by Campaign</div>
                            </div>
                            {campaignData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={campaignData} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" paddingAngle={3}>
                                            {campaignData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v: any) => [v.toLocaleString(), 'Clicks']} />
                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <div className="empty-state"><div className="empty-state-icon">📊</div>No campaign data yet</div>}
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'links' && (
                <div className="table-wrapper">
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="section-title">All Tracked Links</div>
                        <button className="btn btn-secondary btn-sm"><Download size={13} /> Export</button>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Original URL</th>
                                <th>Campaign</th>
                                <th>Source</th>
                                <th>Medium</th>
                                <th>Region</th>
                                <th>Clicks</th>
                                <th>CTR</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {links.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No tracked links yet</td></tr>
                            ) : links.map(l => (
                                <tr key={l.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 240 }}>
                                            <Link2 size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
                                            <span className="truncate" style={{ fontSize: '0.8rem' }}>{l.original_url}</span>
                                        </div>
                                    </td>
                                    <td>{l.utm_campaign ? <span className="badge badge-purple">{l.utm_campaign}</span> : '—'}</td>
                                    <td style={{ fontSize: '0.8rem' }}>{l.utm_source || '—'}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.utm_medium || '—'}</td>
                                    <td><span className="badge badge-info">{l.region || 'Global'}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 50, height: 4, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.min(100, ((l.total_clicks || 0) / Math.max(...links.map(ll => ll.total_clicks || 0), 1)) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
                                            </div>
                                            <span style={{ fontWeight: 700 }}>{(l.total_clicks || 0).toLocaleString()}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{l.ctr ? `${l.ctr.toFixed(2)}%` : '—'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleCopy(l.tracking_url || l.original_url)} title="Copy link"><Copy size={13} /></button>
                                            <a href={l.original_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon btn-sm" title="Open"><ExternalLink size={13} /></a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'campaigns' && (
                <div>
                    {campaignData.length === 0 ? (
                        <div className="empty-state" style={{ padding: '60px' }}>
                            <div className="empty-state-icon">🚀</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>No campaigns yet</div>
                            <div style={{ fontSize: '0.82rem', marginBottom: 16 }}>Create tracked links with UTM campaigns to see data here.</div>
                            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Create First Campaign Link</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {campaignData.map((c, i) => {
                                const campaignLinks = links.filter(l => l.utm_campaign === c.name);
                                const maxClicks = Math.max(...campaignData.map(x => x.value), 1);
                                return (
                                    <div key={c.name} className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 10, background: COLORS[i % COLORS.length] + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <TrendingUp size={18} color={COLORS[i % COLORS.length]} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>{c.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{campaignLinks.length} link{campaignLinks.length !== 1 ? 's' : ''}</div>
                                            <div style={{ marginTop: 8, height: 6, background: 'var(--bg-tertiary)', borderRadius: 99, overflow: 'hidden' }}>
                                                <div style={{ width: `${(c.value / maxClicks) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 99, transition: 'width 0.8s ease' }} />
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: COLORS[i % COLORS.length], letterSpacing: '-0.03em' }}>{c.value.toLocaleString()}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>total clicks</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Create Link Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3>Create Tracking Link</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Original URL *</label>
                                <input className="input" type="url" placeholder="https://yourpage.com/..." value={newLink.original_url} onChange={e => setNewLink(p => ({ ...p, original_url: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="form-group">
                                    <label className="form-label">UTM Campaign</label>
                                    <input className="input" placeholder="e.g. summer-2025" value={newLink.utm_campaign} onChange={e => setNewLink(p => ({ ...p, utm_campaign: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">UTM Source</label>
                                    <input className="input" placeholder="linkedin" value={newLink.utm_source} onChange={e => setNewLink(p => ({ ...p, utm_source: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">UTM Medium</label>
                                    <input className="input" placeholder="social" value={newLink.utm_medium} onChange={e => setNewLink(p => ({ ...p, utm_medium: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">UTM Content</label>
                                    <input className="input" placeholder="post-id or variant" value={newLink.utm_content} onChange={e => setNewLink(p => ({ ...p, utm_content: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Region</label>
                                <select className="select" value={newLink.region} onChange={e => setNewLink(p => ({ ...p, region: e.target.value }))}>
                                    {['Global', 'India', 'USA', 'Indonesia'].map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleCreate}><Link2 size={14} /> Create Link</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
