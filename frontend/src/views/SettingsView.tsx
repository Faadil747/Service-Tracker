import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { settingsApi, usersApi, alertsApi, linksApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Alert, User as UserType, LinkTracking } from '../types';
import toast from 'react-hot-toast';

interface SettingsData {
    linkedin_proxy_url: string;
    deepseek_model: string;
    dev_mode: boolean;
    deepseek_key_set: boolean;
    linkedin_key_set: boolean;
}

export const SettingsView: React.FC = () => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [tab, setTab] = useState<'profile' | 'api' | 'team' | 'alerts' | 'links'>('profile');
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [links, setLinks] = useState<LinkTracking[]>([]);
    const [teamUsers, setTeamUsers] = useState<UserType[]>([]);
    const [showAddUser, setShowAddUser] = useState(false);
    const [showAddLink, setShowAddLink] = useState(false);
    const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

    // Form states
    const [apiKey, setApiKey] = useState('');
    const [linkedinKey, setLinkedinKey] = useState('');
    const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'agent', region: 'India', password: '' });
    const [newLink, setNewLink] = useState({ original_url: '', utm_campaign: '', utm_source: 'linkedin', utm_medium: 'social', region: 'Global' });
    const [alertTitle, setAlertTitle] = useState('');
    const [alertBody, setAlertBody] = useState('');
    const [alertPriority, setAlertPriority] = useState<'high' | 'critical'>('high');
    const [newAlert, setShowNewAlert] = useState(false);

    useEffect(() => { loadAll(); }, [tab]);

    const loadAll = async () => {
        try {
            if (tab === 'api' && isAdmin) {
                const res = await settingsApi.get();
                setSettings(res.data);
            }
            if (tab === 'team' && isAdmin) {
                const res = await usersApi.list();
                setTeamUsers(res.data);
            }
            if (tab === 'alerts') {
                const res = await alertsApi.list({ status: 'open' });
                setAlerts(res.data);
            }
            if (tab === 'links') {
                const res = await linksApi.list();
                setLinks(res.data);
            }
        } catch { }
    };

    const handleSaveApiKey = async (keyName: string, value: string) => {
        try {
            await settingsApi.upsertApiConfig({ key_name: keyName, value, description: `${keyName} API key` });
            toast.success('API key saved!');
        } catch { toast.error('Failed to save'); }
    };

    const handleAddUser = async () => {
        try {
            await usersApi.create(newUser);
            toast.success('User created!');
            setShowAddUser(false);
            setNewUser({ email: '', full_name: '', role: 'agent', region: 'India', password: '' });
            loadAll();
        } catch { toast.error('Failed to create user'); }
    };

    const handleRemoveUser = async (id: string) => {
        if (!confirm('Remove this user?')) return;
        try {
            await usersApi.remove(id);
            toast.success('User removed');
            loadAll();
        } catch { toast.error('Failed to remove user'); }
    };

    const handleCreateLink = async () => {
        try {
            await linksApi.create(newLink);
            toast.success('Short link created!');
            setShowAddLink(false);
            setNewLink({ original_url: '', utm_campaign: '', utm_source: 'linkedin', utm_medium: 'social', region: 'Global' });
            loadAll();
        } catch { toast.error('Failed to create link'); }
    };

    const handleRaiseAlert = async () => {
        try {
            await alertsApi.create({ title: alertTitle, body: alertBody, priority: alertPriority, region: user?.region || 'Global' });
            toast.success('Alert raised!');
            setShowNewAlert(false);
            setAlertTitle(''); setAlertBody('');
            loadAll();
        } catch { toast.error('Failed to raise alert'); }
    };

    const handleResolveAlert = async (id: string) => {
        try {
            await alertsApi.resolve(id);
            toast.success('Alert resolved!');
            loadAll();
        } catch { }
    };

    const TAB_STYLE = (active: boolean) => ({
        padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none',
        fontSize: '0.85rem', fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent-glow)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'all 0.18s',
    });

    return (
        <div className="page-content animate-fade">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', padding: 4, borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
                {[
                    { id: 'profile', label: '👤 Profile' },
                    { id: 'alerts', label: '🚨 Alerts' },
                    { id: 'links', label: '🔗 Link Tracking' },
                    ...(isAdmin ? [{ id: 'api', label: '🔑 API Keys' }, { id: 'team', label: '👥 Team' }] : []),
                ].map(t => (
                    <button key={t.id} style={TAB_STYLE(tab === (t.id as any))} onClick={() => setTab(t.id as any)}>{t.label}</button>
                ))}
            </div>

            {/* ── Profile Tab ──────────────────────────────────────────────── */}
            {tab === 'profile' && user && (
                <div className="grid-2" style={{ maxWidth: 800 }}>
                    <div className="chart-container">
                        <div className="chart-title">My Profile</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)' }}>
                                    {user.full_name.charAt(0)}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{user.full_name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</div>
                                </div>
                            </div>
                            <div><label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ROLE</label><span className={`badge ${user.role === 'admin' ? 'badge-purple' : user.role === 'developer' ? 'badge-info' : 'badge-accent'}`}>{user.role.toUpperCase()}</span></div>
                            <div><label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>REGION</label><span className="badge badge-muted">{user.region}</span></div>
                            {user.linkedin_url && (
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>LINKEDIN</label>
                                    <a href={user.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{user.linkedin_url}</a>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="chart-container">
                        <div className="chart-title">Notification Preferences</div>
                        {[
                            { label: 'Task assignments', key: 'tasks' },
                            { label: 'Post approvals', key: 'posts' },
                            { label: 'Missed deadlines', key: 'deadlines' },
                            { label: 'Alert notifications', key: 'alerts' },
                            { label: 'LinkedIn engagement', key: 'engagement' },
                        ].map(({ label, key }) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.875rem' }}>{label}</span>
                                <button className="btn btn-sm" style={{ padding: '4px 10px', background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid var(--border-strong)', borderRadius: 99 }}>On</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── API Keys Tab (Admin only) ─────────────────────────────────── */}
            {tab === 'api' && isAdmin && (
                <div style={{ maxWidth: 700 }}>
                    {settings && (
                        <div className="glass-card" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <span className={`badge ${settings.dev_mode ? 'badge-warning' : 'badge-success'}`}>{settings.dev_mode ? 'Dev Mode ON' : 'Production'}</span>
                            <span className={`badge ${settings.deepseek_key_set ? 'badge-success' : 'badge-danger'}`}>DeepSeek: {settings.deepseek_key_set ? 'Configured' : 'Not Set'}</span>
                            <span className={`badge ${settings.linkedin_key_set ? 'badge-success' : 'badge-danger'}`}>LinkedIn: {settings.linkedin_key_set ? 'Configured' : 'Not Set'}</span>
                        </div>
                    )}

                    {/* DeepSeek Key */}
                    <div className="chart-container" style={{ marginBottom: 16 }}>
                        <div className="chart-title">🤖 DeepSeek AI</div>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>API KEY</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input className="input" type={showApiKey['deepseek'] ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-deepseek-..." style={{ paddingRight: 40 }} />
                                    <button onClick={() => setShowApiKey(p => ({ ...p, deepseek: !p.deepseek }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                        {showApiKey['deepseek'] ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveApiKey('DEEPSEEK_API_KEY', apiKey)}>Save</button>
                            </div>
                        </div>
                    </div>

                    {/* LinkedIn Keys */}
                    <div className="chart-container">
                        <div className="chart-title">💼 LinkedIn OAuth</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CLIENT ID</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input" type={showApiKey['li_id'] ? 'text' : 'password'} placeholder="7xxxxxxxxxxxxxxxx" onChange={e => setLinkedinKey(e.target.value)} />
                                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveApiKey('LINKEDIN_CLIENT_ID', linkedinKey)}>Save</button>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CLIENT SECRET</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input" type="password" placeholder="••••••••••••••••" />
                                    <button className="btn btn-primary btn-sm">Save</button>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>PROXY URL</label>
                                <input className="input" defaultValue={settings?.linkedin_proxy_url || 'http://localhost:3001'} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Team Tab (Admin only) ─────────────────────────────────────── */}
            {tab === 'team' && isAdmin && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div><h4>Team Management</h4><p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Manage agents and their regional assignments</p></div>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}><Plus size={14} /> Add User</button>
                    </div>

                    {showAddUser && (
                        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                            <h4 style={{ marginBottom: 14 }}>New User</h4>
                            <div className="grid-2" style={{ gap: 10 }}>
                                <input className="input" placeholder="Full Name" value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} />
                                <input className="input" type="email" placeholder="Email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                                <select className="select" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                                    <option value="agent">Agent</option>
                                    <option value="admin">Admin</option>
                                    <option value="developer">Developer</option>
                                </select>
                                <select className="select" value={newUser.region} onChange={e => setNewUser(p => ({ ...p, region: e.target.value }))}>
                                    {['India', 'USA', 'Indonesia', 'Global'].map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <input className="input" type="password" placeholder="Initial Password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button className="btn btn-primary btn-sm" onClick={handleAddUser}>Create User</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowAddUser(false)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    <div className="chart-container">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {teamUsers.map(u => (
                                <div key={u.id} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>
                                        {u.full_name.charAt(0)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.full_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                    </div>
                                    <span className="badge badge-muted">{u.region}</span>
                                    <span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'developer' ? 'badge-info' : 'badge-accent'}`}>{u.role}</span>
                                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                                    {u.id !== user?.id && (
                                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => handleRemoveUser(u.id)}><Trash2 size={14} /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Alerts Tab ─────────────────────────────────────────────────── */}
            {tab === 'alerts' && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div><h4>Raise a Flag 🚩</h4><p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Flag issues for admin attention</p></div>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowNewAlert(true)}><Plus size={14} /> Raise Alert</button>
                    </div>

                    {newAlert && (
                        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                            <h4 style={{ marginBottom: 14 }}>New Alert</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <input className="input" placeholder="Alert title" value={alertTitle} onChange={e => setAlertTitle(e.target.value)} />
                                <textarea className="textarea" placeholder="Describe the issue..." value={alertBody} onChange={e => setAlertBody(e.target.value)} />
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {(['high', 'critical'] as const).map(p => (
                                        <button key={p} className="btn btn-sm" onClick={() => setAlertPriority(p)} style={{ background: alertPriority === p ? (p === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)') : 'var(--surface)', color: alertPriority === p ? (p === 'critical' ? 'var(--danger)' : 'var(--warning)') : 'var(--text-secondary)', border: `1px solid ${alertPriority === p ? 'currentColor' : 'var(--border)'}` }}>
                                            {p === 'critical' ? '🔴 Critical' : '🟡 High'}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleRaiseAlert}>Raise Alert</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowNewAlert(false)}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {alerts.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No open alerts 🎉</div>}
                        {alerts.map(a => (
                            <div key={a.id} className={a.priority === 'critical' ? 'alert-critical' : 'alert-high'} style={{ padding: '14px 16px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{a.title}</div>
                                    {a.body && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.body}</div>}
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>{a.region} · {new Date(a.created_at).toLocaleDateString()}</div>
                                </div>
                                {isAdmin && (
                                    <button className="btn btn-sm" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => handleResolveAlert(a.id)}>
                                        ✓ Resolve
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Link Tracking Tab ────────────────────────────────────────── */}
            {tab === 'links' && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div><h4>🔗 UTM Link Tracker</h4><p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Create trackable short links for posts and campaigns</p></div>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddLink(true)}><Plus size={14} /> Shorten URL</button>
                    </div>

                    {showAddLink && (
                        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
                            <h4 style={{ marginBottom: 14 }}>New Trackable Link</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <input className="input" placeholder="Destination URL (https://...)" value={newLink.original_url} onChange={e => setNewLink(p => ({ ...p, original_url: e.target.value }))} />
                                <div className="grid-2" style={{ gap: 10 }}>
                                    <input className="input" placeholder="UTM Campaign (e.g. q3-hiring)" value={newLink.utm_campaign} onChange={e => setNewLink(p => ({ ...p, utm_campaign: e.target.value }))} />
                                    <select className="select" value={newLink.region} onChange={e => setNewLink(p => ({ ...p, region: e.target.value }))}>
                                        {['Global', 'India', 'USA', 'Indonesia'].map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleCreateLink}>Create Link</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddLink(false)}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="chart-container">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {links.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No links yet — create your first!</div>}
                            {links.map(l => (
                                <div key={l.id} className="glass-card" style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                                                <code style={{ fontSize: '0.8rem', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: 6 }}>{l.short_url}</code>
                                                <span className="badge badge-muted">{l.region}</span>
                                                <span className="badge badge-muted">{l.utm_campaign}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="truncate">{l.original_url}</div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{l.total_clicks}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>clicks</div>
                                        </div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(l.short_url); toast.success('Copied!'); }}>
                                            📋 Copy
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
