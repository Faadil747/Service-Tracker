import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Loader, Save, Bell, Link2 } from 'lucide-react';
import { settingsApi, usersApi, metricsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { NOTIF_CATEGORIES, getNotifPrefs, setNotifPref, NotifCategory } from '../utils/notificationPrefs';

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

const REGIONS = ['Global', 'India', 'USA', 'Indonesia'];

// Small accessible toggle switch.
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
    <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        style={{
            width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative',
            background: on ? 'var(--accent)' : 'var(--border-strong, #cbd5e1)', transition: 'background 0.18s', flexShrink: 0,
        }}
    >
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
);

export const SettingsView: React.FC = () => {
    const { user, setUser } = useAuthStore() as any;
    const isAdmin = user?.role === 'admin';
    const [tab, setTab] = useState<'profile' | 'notifications' | 'api'>('profile');
    const [settings, setSettings] = useState<SettingsData | null>(null);
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

    // Editable profile
    const [profile, setProfile] = useState({ full_name: user?.full_name || '', region: user?.region || 'Global', linkedin_url: user?.linkedin_url || '' });
    const [savingProfile, setSavingProfile] = useState(false);

    // Notification prefs (persisted locally, honoured by the toast layer)
    const [notifPrefs, setNotifPrefs] = useState(getNotifPrefs());

    useEffect(() => {
        if (tab === 'api' && isAdmin) {
            settingsApi.get().then(r => setSettings(r.data)).catch(() => { });
            testLinkedIn();
            testDeepSeek();
        }
    }, [tab, isAdmin]);

    const testLinkedIn = async () => {
        setTestingLinkedin(true); setLinkedinStatus(null);
        try { setLinkedinStatus((await settingsApi.linkedinStatus()).data); }
        catch (e: any) { setLinkedinStatus({ connected: false, error: e?.response?.data?.detail || 'Connection failed' }); }
        finally { setTestingLinkedin(false); }
    };
    const testDeepSeek = async () => {
        setTestingDeepseek(true); setDeepseekStatus(null);
        try { setDeepseekStatus((await settingsApi.deepseekStatus()).data); }
        catch (e: any) { setDeepseekStatus({ connected: false, error: e?.response?.data?.detail || 'Connection failed' }); }
        finally { setTestingDeepseek(false); }
    };
    const syncPageMetrics = async () => {
        setSyncingMetrics(true);
        try {
            const res = await metricsApi.syncPage();
            res.data.synced ? toast.success(`Synced! Followers: ${res.data.followers?.toLocaleString() ?? 'N/A'}`) : toast.error(res.data.message || 'Sync failed');
        } catch (e: any) { toast.error(e?.response?.data?.detail || 'Sync failed'); }
        finally { setSyncingMetrics(false); }
    };
    const handleSaveApiKey = async (keyName: string, value: string) => {
        if (!value.trim()) { toast.error('Enter a value first'); return; }
        try { await settingsApi.upsertApiConfig({ key_name: keyName, value, description: `${keyName} API key` }); toast.success('Saved!'); }
        catch { toast.error('Failed to save'); }
    };

    const handleSaveProfile = async () => {
        if (!profile.full_name.trim()) { toast.error('Name is required'); return; }
        setSavingProfile(true);
        try {
            const res = await usersApi.updateProfile(profile);
            if (setUser) setUser({ ...user, ...res.data });
            toast.success('Profile updated');
        } catch { toast.error('Failed to update profile'); }
        setSavingProfile(false);
    };

    const toggleNotif = (key: NotifCategory, value: boolean) => {
        setNotifPref(key, value);
        setNotifPrefs(getNotifPrefs());
        toast.success(`${value ? 'Enabled' : 'Muted'} · ${key}`);
    };

    const TAB_STYLE = (active: boolean) => ({
        padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: 'none',
        fontSize: '0.85rem', fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent-glow)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)', transition: 'all 0.18s', fontFamily: 'inherit',
    });

    const StatusBadge: React.FC<{ status: ConnectionStatus | null; loading: boolean }> = ({ status, loading }) => {
        if (loading) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--text-muted)' }}><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Testing…</span>;
        if (!status) return null;
        return status.connected
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '3px 10px', borderRadius: 99 }}><CheckCircle size={13} /> Connected</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '3px 10px', borderRadius: 99 }}><XCircle size={13} /> Disconnected</span>;
    };

    return (
        <div className="page-content animate-fade">
            <div className="page-header">
                <div className="page-header-left">
                    <div className="page-title">Settings</div>
                    <div className="page-subtitle">Manage your profile, notifications{isAdmin ? ' and integrations' : ''}.</div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', padding: 4, borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
                {[
                    { id: 'profile', label: '👤 Profile' },
                    { id: 'notifications', label: '🔔 Notifications' },
                    ...(isAdmin ? [{ id: 'api', label: '🔑 API & Connections' }] : []),
                ].map(t => (
                    <button key={t.id} style={TAB_STYLE(tab === (t.id as any))} onClick={() => setTab(t.id as any)}>{t.label}</button>
                ))}
            </div>

            {/* ── Profile ──────────────────────────────────────────────────── */}
            {tab === 'profile' && user && (
                <div className="grid-2" style={{ maxWidth: 860 }}>
                    <div className="chart-container">
                        <div className="chart-title" style={{ marginBottom: 16 }}>My Profile</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)' }}>{user.full_name.charAt(0)}</div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{user.full_name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                                    <span className={`badge ${user.role === 'admin' ? 'badge-purple' : user.role === 'developer' ? 'badge-info' : 'badge-accent'}`}>{user.role.toUpperCase()}</span>
                                    <span className="badge badge-muted">{user.region}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group"><label className="form-label">Full name</label><input className="input" value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} /></div>
                            <div className="form-group"><label className="form-label">Region</label>
                                <select className="select" value={profile.region} onChange={e => setProfile(p => ({ ...p, region: e.target.value }))}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select>
                            </div>
                            <div className="form-group"><label className="form-label">LinkedIn URL</label><input className="input" value={profile.linkedin_url} onChange={e => setProfile(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/…" /></div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile}><Save size={14} /> {savingProfile ? 'Saving…' : 'Save changes'}</button>
                            </div>
                        </div>
                    </div>

                    <div className="chart-container">
                        <div className="chart-title" style={{ marginBottom: 6 }}>Account</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>Your access level and quick links.</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Email</span><span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{user.email}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Role</span><span style={{ fontWeight: 600, fontSize: '0.82rem', textTransform: 'capitalize' }}>{user.role}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Region</span><span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{user.region}</span></div>
                            <a href="/links" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginTop: 4, borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600 }}><Link2 size={14} /> Open Link Analytics</a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Notifications (functional, persisted) ────────────────────── */}
            {tab === 'notifications' && (
                <div className="chart-container" style={{ maxWidth: 720 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Bell size={16} color="var(--accent)" />
                        <div className="chart-title" style={{ margin: 0 }}>Notification Preferences</div>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                        Choose which alerts pop up as toasts. These apply instantly and are saved on this device.
                    </div>
                    {NOTIF_CATEGORIES.map(({ key, label, desc }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{label}</div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                            </div>
                            <Toggle on={notifPrefs[key]} onChange={v => toggleNotif(key, v)} />
                        </div>
                    ))}
                </div>
            )}

            {/* ── API Keys + Connection Status (Admin only) ────────────────── */}
            {tab === 'api' && isAdmin && (
                <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {settings && (
                        <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>SYSTEM STATUS</span>
                            <span className={`badge ${settings.dev_mode ? 'badge-warning' : 'badge-success'}`}>{settings.dev_mode ? '⚠️ Dev Mode' : '✅ Production'}</span>
                            <span className={`badge ${settings.deepseek_key_set ? 'badge-success' : 'badge-danger'}`}>🤖 DeepSeek: {settings.deepseek_key_set ? 'Configured' : 'Not Set'}</span>
                            <span className={`badge ${settings.linkedin_access_token_set ? 'badge-success' : 'badge-danger'}`}>💼 LinkedIn Token: {settings.linkedin_access_token_set ? 'Configured' : 'Not Set'}</span>
                            {settings.linkedin_org_id && <span className="badge badge-info">🏢 Org ID: {settings.linkedin_org_id}</span>}
                        </div>
                    )}

                    <div className="chart-container">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,119,181,0.12)', border: '1px solid rgba(0,119,181,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💼</div>
                                <div>
                                    <div className="chart-title" style={{ margin: 0 }}>LinkedIn API</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Org ID: {settings?.linkedin_org_id || '—'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <StatusBadge status={linkedinStatus} loading={testingLinkedin} />
                                <button className="btn btn-secondary btn-sm" onClick={testLinkedIn} disabled={testingLinkedin} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={12} style={testingLinkedin ? { animation: 'spin 1s linear infinite' } : {}} /> Test</button>
                            </div>
                        </div>

                        {linkedinStatus?.connected && (
                            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
                                {linkedinStatus.account_name && <div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACCOUNT</div><div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{linkedinStatus.account_name}</div></div>}
                                {linkedinStatus.followers !== undefined && <div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>FOLLOWERS</div><div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>{linkedinStatus.followers.toLocaleString()}</div></div>}
                            </div>
                        )}
                        {linkedinStatus && !linkedinStatus.connected && (
                            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#ef4444' }}>❌ {linkedinStatus.error || 'Connection failed'}</div>
                        )}

                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-primary btn-sm" onClick={syncPageMetrics} disabled={syncingMetrics} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{syncingMetrics ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />} Sync Page Metrics Now</button>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Manual pull — the only action that calls the LinkedIn API</span>
                        </div>

                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>ACCESS TOKEN (store in DB)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input className="input" type={showApiKey['li_token'] ? 'text' : 'password'} value={linkedinKey} onChange={e => setLinkedinKey(e.target.value)} placeholder="AQW…" style={{ paddingRight: 40 }} />
                                    <button onClick={() => setShowApiKey(p => ({ ...p, li_token: !p.li_token }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>{showApiKey['li_token'] ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveApiKey('LINKEDIN_ACCESS_TOKEN', linkedinKey)}>Save</button>
                            </div>
                            <p style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 5 }}>ℹ️ The active token is loaded from the server's <code>.env</code>. This stores a copy in the database for reference.</p>
                        </div>
                    </div>

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
                                <button className="btn btn-secondary btn-sm" onClick={testDeepSeek} disabled={testingDeepseek} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><RefreshCw size={12} style={testingDeepseek ? { animation: 'spin 1s linear infinite' } : {}} /> Test</button>
                            </div>
                        </div>
                        {deepseekStatus && !deepseekStatus.connected && (
                            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#ef4444' }}>❌ {deepseekStatus.error || 'Connection failed'}</div>
                        )}
                        <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>API KEY (store in DB)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input className="input" type={showApiKey['deepseek'] ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" style={{ paddingRight: 40 }} />
                                    <button onClick={() => setShowApiKey(p => ({ ...p, deepseek: !p.deepseek }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>{showApiKey['deepseek'] ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveApiKey('DEEPSEEK_API_KEY', apiKey)}>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
