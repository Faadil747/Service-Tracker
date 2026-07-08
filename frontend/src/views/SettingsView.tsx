import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Loader } from 'lucide-react';
import { settingsApi, usersApi, linksApi, metricsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { User as UserType, LinkTracking } from '../types';
import toast from 'react-hot-toast';

interface SettingsData {
    linkedin_proxy_url: string;
    deepseek_model: string;
    dev_mode: boolean;
    deepseek_key_set: boolean;
    linkedin_client_id_set: boolean;
    linkedin_access_token_set: boolean;
    linkedin_org_id: string;
}

interface ConnectionStatus {
    connected: boolean;
    error?: string;
    account_name?: string;
    org_name?: string;
    org_id?: string;
    followers?: number;
    model?: string;
    base_url?: string;
}

export const SettingsView: React.FC = () => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [tab, setTab] = useState<'profile' | 'api' | 'team' | 'links'>('profile');
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [links, setLinks] = useState<LinkTracking[]>([]);
    const [teamUsers, setTeamUsers] = useState<UserType[]>([]);
    const [showAddUser, setShowAddUser] = useState(false);
    const [showAddLink, setShowAddLink] = useState(false);
    const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

    // Connection status
    const [linkedinStatus, setLinkedinStatus] = useState<ConnectionStatus | null>(null);
    const [deepseekStatus, setDeepseekStatus] = useState<ConnectionStatus | null>(null);
    const [testingLinkedin, setTestingLinkedin] = useState(false);
    const [testingDeepseek, setTestingDeepseek] = useState(false);
    const [syncingMetrics, setSyncingMetrics] = useState(false);

    // Form states
    const [apiKey, setApiKey] = useState('');
    const [linkedinKey, setLinkedinKey] = useState('');
    const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'agent', region: 'India', password: '' });
    const [newLink, setNewLink] = useState({ original_url: '', utm_campaign: '', utm_source: 'linkedin', utm_medium: 'social', region: 'Global' });

    useEffect(() => { loadAll(); }, [tab]);

    // Auto-test connections when API tab is opened
    useEffect(() => {
        if (tab === 'api' && isAdmin) {
            testLinkedIn();
            testDeepSeek();
        }
    }, [tab]);

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
            if (tab === 'links') {
                const res = await linksApi.list();
                setLinks(res.data);
            }
        } catch { }
    };

    const testLinkedIn = async () => {
        setTestingLinkedin(true);
        setLinkedinStatus(null);
        try {
            const res = await settingsApi.linkedinStatus();
            setLinkedinStatus(res.data);
        } catch (e: any) {
            setLinkedinStatus({ connected: false, error: e?.response?.data?.detail || 'Connection failed' });
        } finally {
            setTestingLinkedin(false);
        }
    };

    const testDeepSeek = async () => {
        setTestingDeepseek(true);
        setDeepseekStatus(null);
        try {
            const res = await settingsApi.deepseekStatus();
            setDeepseekStatus(res.data);
        } catch (e: any) {
            setDeepseekStatus({ connected: false, error: e?.response?.data?.detail || 'Connection failed' });
        } finally {
            setTestingDeepseek(false);
        }
    };

    const syncPageMetrics = async () => {
        setSyncingMetrics(true);
        try {
            const res = await metricsApi.syncPage();
            if (res.data.synced) {
                toast.success(`Synced! Followers: ${res.data.followers?.toLocaleString() ?? 'N/A'}`);
            } else {
                toast.error(res.data.message || 'Sync failed');
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Sync failed');
        } finally {
            setSyncingMetrics(false);
        }
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

    const TAB_STYLE = (active: boolean) => ({
        padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none',
        fontSize: '0.85rem', fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent-glow)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'all 0.18s',
    });

    const StatusBadge: React.FC<{ status: ConnectionStatus | null; loading: boolean }> = ({ status, loading }) => {
        if (loading) return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Testing…
            </span>
        );
        if (!status) return null;
        return status.connected ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 99 }}>
                <CheckCircle size={13} /> Connected
            </span>
        ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '3px 10px', borderRadius: 99 }}>
                <XCircle size={13} /> Disconnected
            </span>
        );
    };

    return (
        <div className="page-content animate-fade">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', padding: 4, borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
                {[
                    { id: 'profile', label: '👤 Profile' },
                    { id: 'links', label: '🔗 Link Tracking' },
                    ...(isAdmin ? [{ id: 'api', label: '🔑 API & Connections' }, { id: 'team', label: '👥 Team' }] : []),
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

            {/* ── API Keys + Connection Status Tab (Admin only) ─────────────── */}
            {tab === 'api' && isAdmin && (
                <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Status overview row */}
                    {settings && (
                        <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>SYSTEM STATUS</span>
                            <span className={`badge ${settings.dev_mode ? 'badge-warning' : 'badge-success'}`}>{settings.dev_mode ? '⚠️ Dev Mode' : '✅ Production'}</span>
                            <span className={`badge ${settings.deepseek_key_set ? 'badge-success' : 'badge-danger'}`}>🤖 DeepSeek: {settings.deepseek_key_set ? 'Configured' : 'Not Set'}</span>
                            <span className={`badge ${settings.linkedin_access_token_set ? 'badge-success' : 'badge-danger'}`}>💼 LinkedIn Token: {settings.linkedin_access_token_set ? 'Configured' : 'Not Set'}</span>
                            {settings.linkedin_org_id && (
                                <span className="badge badge-info">🏢 Org ID: {settings.linkedin_org_id}</span>
                            )}
                        </div>
                    )}

                    {/* LinkedIn Connection Card */}
                    <div className="chart-container">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,119,181,0.12)', border: '1px solid rgba(0,119,181,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💼</div>
                                <div>
                                    <div className="chart-title" style={{ margin: 0 }}>LinkedIn API</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Techwaukee · Org ID: {settings?.linkedin_org_id || '15078287'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <StatusBadge status={linkedinStatus} loading={testingLinkedin} />
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={testLinkedIn}
                                    disabled={testingLinkedin}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                >
                                    <RefreshCw size={12} style={testingLinkedin ? { animation: 'spin 1s linear infinite' } : {}} />
                                    Test
                                </button>
                            </div>
                        </div>

                        {/* Connection details */}
                        {linkedinStatus && linkedinStatus.connected && (
                            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
                                {linkedinStatus.account_name && (
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>ACCOUNT</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{linkedinStatus.account_name}</div>
                                    </div>
                                )}
                                {linkedinStatus.org_name && (
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>PAGE</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{linkedinStatus.org_name}</div>
                                    </div>
                                )}
                                {linkedinStatus.followers !== undefined && (
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>FOLLOWERS</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>{linkedinStatus.followers.toLocaleString()}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {linkedinStatus && !linkedinStatus.connected && (
                            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#ef4444' }}>
                                ❌ {linkedinStatus.error || 'Connection failed'}
                            </div>
                        )}

                        {/* Sync page metrics button */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={syncPageMetrics}
                                disabled={syncingMetrics}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {syncingMetrics ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                                Sync Page Metrics Now
                            </button>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pull latest follower + visitor data from LinkedIn</span>
                        </div>

                        {/* Access token field */}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>ACCESS TOKEN (override)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input className="input" type={showApiKey['li_token'] ? 'text' : 'password'} value={linkedinKey} onChange={e => setLinkedinKey(e.target.value)} placeholder="AQWI45juh_..." style={{ paddingRight: 40 }} />
                                    <button onClick={() => setShowApiKey(p => ({ ...p, li_token: !p.li_token }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                        {showApiKey['li_token'] ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveApiKey('LINKEDIN_ACCESS_TOKEN', linkedinKey)}>Save</button>
                            </div>
                            <p style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 5 }}>
                                ℹ️ The active token is loaded from the server's <code>.env</code> file. This field lets you store a new token in the database for future reference.
                            </p>
                        </div>
                    </div>

                    {/* DeepSeek AI Card */}
                    <div className="chart-container">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🤖</div>
                                <div>
                                    <div className="chart-title" style={{ margin: 0 }}>DeepSeek AI</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{settings?.deepseek_model || 'deepseek-chat'} · api.deepseek.com</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <StatusBadge status={deepseekStatus} loading={testingDeepseek} />
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={testDeepSeek}
                                    disabled={testingDeepseek}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                >
                                    <RefreshCw size={12} style={testingDeepseek ? { animation: 'spin 1s linear infinite' } : {}} />
                                    Test
                                </button>
                            </div>
                        </div>

                        {deepseekStatus && deepseekStatus.connected && (
                            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>MODEL</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{deepseekStatus.model}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>ENDPOINT</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>api.deepseek.com</div>
                                </div>
                            </div>
                        )}
                        {deepseekStatus && !deepseekStatus.connected && (
                            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#ef4444' }}>
                                ❌ {deepseekStatus.error || 'Connection failed'}
                            </div>
                        )}

                        {/* API key input */}
                        <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>API KEY (override)</label>
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
                </div>
            )}

            {/* ── Team Tab (Admin only) ─────────────────────────────────────── */}
            {tab === 'team' && isAdmin && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
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
                                <div key={u.id} className="glass-card team-member-card">
                                    <div className="team-member-avatar">
                                        {u.full_name.charAt(0)}
                                    </div>
                                    <div className="team-member-info">
                                        <div className="team-member-name">{u.full_name}</div>
                                        <div className="team-member-email">{u.email}</div>
                                    </div>
                                    <div className="team-member-badges">
                                        <span className="badge badge-muted">{u.region}</span>
                                        <span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'developer' ? 'badge-info' : 'badge-accent'}`}>{u.role}</span>
                                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                                    </div>
                                    {u.id !== user?.id && (
                                        <button className="btn btn-icon btn-danger btn-sm team-member-delete" onClick={() => handleRemoveUser(u.id)}><Trash2 size={14} /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Link Tracking Tab ────────────────────────────────────────── */}
            {tab === 'links' && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
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
                                    <div className="link-tracking-card">
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                                                <code style={{ fontSize: '0.8rem', color: 'var(--accent)', background: 'var(--accent-glow)', padding: '2px 8px', borderRadius: 6 }}>{l.short_url}</code>
                                                <span className="badge badge-muted">{l.region}</span>
                                                <span className="badge badge-muted">{l.utm_campaign}</span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="truncate">{l.original_url}</div>
                                        </div>
                                        <div className="link-tracking-stats-actions">
                                            <div style={{ textAlign: 'right', flexShrink: 0 }} className="link-clicks-container">
                                                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{l.total_clicks}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 4 }}>clicks</span>
                                            </div>
                                            <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(l.short_url); toast.success('Copied!'); }}>
                                                📋 Copy
                                            </button>
                                        </div>
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
