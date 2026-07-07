import React, { useEffect, useState, useRef } from 'react';
import {
    Bell, LogOut, Zap, CheckSquare, LayoutDashboard, TrendingUp,
    Settings, Calendar, Link2, Users, ChevronDown, MessageSquare, Menu, X,
    AlertTriangle
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { chatApi, alertsApi, usersApi } from '../../services/api';

interface HeaderProps {
    region: string;
    onRegionChange: (r: string) => void;
}

const REGIONS = ['Global', 'India', 'USA', 'Indonesia'];

const getNavItems = (role: string) => [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'agent', 'developer', 'ceo'] },
    { to: '/workspace', icon: CheckSquare, label: 'Workspace', roles: ['admin', 'agent', 'developer', 'ceo'] },
    { to: '/calendar', icon: Calendar, label: 'Calendar', roles: ['admin', 'agent', 'developer', 'ceo'] },
    { to: '/links', icon: Link2, label: 'Link Analytics', roles: ['admin', 'developer', 'ceo'] },
    { to: '/progress', icon: TrendingUp, label: 'Agent Progress', roles: ['admin', 'agent', 'developer', 'ceo'] },
    { to: '/accountability', icon: Users, label: 'Accountability', roles: ['admin', 'ceo'] },
    { to: '/settings', icon: Settings, label: 'Settings', roles: ['admin', 'developer', 'ceo'] },
].filter(item => item.roles.includes(role));

const ROLE_COLORS: Record<string, string> = {
    admin: '#7c3aed',
    ceo: '#db2777',
    developer: '#0891b2',
    agent: '#2563eb',
};

export const Header: React.FC<HeaderProps> = ({ region, onRegionChange }) => {
    const { user, logout } = useAuthStore();
    const { unreadCount, fetchCount, notifications, fetchNotifications, markRead } = useNotificationStore();
    const navigate = useNavigate();

    const handleNotifClick = async (n: any) => {
        if (!n.is_read) {
            try {
                await markRead(n.id);
            } catch (err) { }
        }
        setShowNotifs(false);
        if (n.reference_type === 'task') {
            navigate(`/workspace?taskId=${n.reference_id}`);
        } else if (n.reference_type === 'post') {
            navigate(`/calendar?postId=${n.reference_id}`);
        } else if (n.reference_type === 'alert') {
            try {
                const res = await alertsApi.list(); // fetch immediately to check if alert has task
                const alertMatch = res.data.find((a: any) => a.id === n.reference_id);
                if (alertMatch && (alertMatch.reference_type === 'task' || alertMatch.reference_id)) {
                    navigate(`/workspace?taskId=${alertMatch.reference_id || alertMatch.reference_type}`);
                    return;
                }
            } catch { }
            setShowAlertsSidebar(true);
        } else if (n.reference_type === 'chat' || n.reference_type === 'message') {
            navigate(`?chatWith=${n.reference_id}`);
        }
    };
    const [showNotifs, setShowNotifs] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [chatUnread, setChatUnread] = useState(0);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [showAlertsSidebar, setShowAlertsSidebar] = useState(false);
    const alertsLoaded = useRef(false);

    // New Alert State
    const [showNewAlert, setShowNewAlert] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertBody, setAlertBody] = useState('');
    const [alertPriority, setAlertPriority] = useState<'high' | 'critical'>('high');
    const [alertTargetId, setAlertTargetId] = useState<string>('');
    const [agents, setAgents] = useState<any[]>([]);

    useEffect(() => {
        if (user?.role === 'admin') {
            usersApi.list({ role: 'agent' }).then(res => setAgents(res.data)).catch(() => { });
        }
    }, [user]);

    const navItems = user ? getNavItems(user.role) : [];
    const roleColor = user ? (ROLE_COLORS[user.role] || '#2563eb') : '#2563eb';

    useEffect(() => {
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!user) return;
        const updateChatUnread = () => setChatUnread(chatApi.getUnreadCount(user.id));
        updateChatUnread();
        const interval = setInterval(updateChatUnread, 3000);
        return () => clearInterval(interval);
    }, [user]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const notifEl = document.getElementById('notif-dropdown');
            const profileEl = document.getElementById('profile-dropdown');
            if (notifEl && !notifEl.contains(target)) setShowNotifs(false);
            if (profileEl && !profileEl.contains(target)) setShowProfile(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await alertsApi.list({ status: 'open' });
                setAlerts(res.data);
            } catch { }
        };
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRaiseAlert = async () => {
        if (!alertTitle.trim()) return;
        try {
            await alertsApi.create({
                title: alertTitle,
                body: alertBody,
                priority: alertPriority,
                region: user?.region || 'Global',
                target_user_id: alertTargetId || undefined
            });
            setShowNewAlert(false);
            setAlertTitle(''); setAlertBody(''); setAlertTargetId('');
            const res = await alertsApi.list({ status: 'open' });
            setAlerts(res.data);
        } catch { }
    };

    useEffect(() => {
        if (alerts.length > 0 && !alertsLoaded.current) {
            alertsLoaded.current = true;
            setShowAlertsSidebar(true);
        }
    }, [alerts]);

    const handleBellClick = () => {
        if (!showNotifs) { fetchNotifications(); fetchCount(); }
        setShowNotifs(p => !p);
        setShowProfile(false);
    };

    const handleLogout = () => { logout(); navigate('/login'); };

    const initials = user?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

    return (
        <>
            <header style={{
                background: '#fff',
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, zIndex: 1000,
                height: 'var(--header-height)',
                display: 'flex', alignItems: 'center',
                padding: '0 20px', gap: 0,
                width: '100%',
            }}>
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 20, flexShrink: 0 }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: 'var(--accent-gradient)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Zap size={17} color="#fff" strokeWidth={2.5} fill="#fff" />
                    </div>
                    <div className="brand-text">
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                            Social Tracker
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            GOrecruitAI
                        </div>
                    </div>
                </div>

                {/* Desktop Nav */}
                <nav className="desktop-nav" style={{ gap: 2, flex: 1, overflow: 'hidden' }}>
                    {navItems.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            style={{ position: 'relative' }}
                        >
                            <Icon size={13} />
                            <span style={{ fontSize: '0.78rem' }}>{label}</span>
                            {to === '/chat' && chatUnread > 0 && (
                                <span style={{
                                    position: 'absolute', top: 2, right: 2,
                                    background: 'var(--danger)', color: '#fff',
                                    borderRadius: '50%', width: 14, height: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.55rem', fontWeight: 700,
                                }}>
                                    {chatUnread > 9 ? '9+' : chatUnread}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>

                    {/* Alerts Button */}
                    <button
                        onClick={() => { setShowAlertsSidebar(p => !p); setShowNotifs(false); setShowProfile(false); }}
                        className="btn btn-ghost btn-icon"
                        style={{
                            position: 'relative', padding: 7,
                            background: showAlertsSidebar ? 'var(--danger-glow)' : 'transparent',
                            borderRadius: 8,
                            color: 'var(--danger)',
                        }}
                    >
                        <AlertTriangle size={16} />
                        {alerts.length > 0 && (
                            <span
                                className="notif-badge"
                                style={{
                                    background: 'var(--danger)',
                                    color: '#fff',
                                    animation: 'pulse-dot 2s infinite'
                                }}
                            >
                                {alerts.length}
                            </span>
                        )}
                    </button>

                    {/* Notification Bell */}
                    <div id="notif-dropdown" style={{ position: 'relative' }}>
                        <button onClick={handleBellClick} className="btn btn-ghost btn-icon" style={{
                            position: 'relative', padding: 7,
                            background: showNotifs ? 'var(--bg-tertiary)' : 'transparent',
                            borderRadius: 8,
                        }}>
                            <Bell size={16} />
                            {unreadCount > 0 && (
                                <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                            )}
                        </button>

                        {showNotifs && (
                            <div className="animate-slide-down" style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                                width: 340, background: '#fff',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                                zIndex: 2000, overflow: 'hidden',
                            }}>
                                <div style={{
                                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: 'var(--bg-tertiary)',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Notifications</span>
                                    {unreadCount > 0 && (
                                        <span className="badge badge-danger">{unreadCount} new</span>
                                    )}
                                </div>
                                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                                    {notifications.filter(n => !n.is_read).length === 0 ? (
                                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🔔</div>
                                            All caught up!
                                        </div>
                                    ) : notifications.filter(n => !n.is_read).slice(0, 15).map((n) => (
                                        <div key={n.id}
                                            onClick={() => handleNotifClick(n)}
                                            style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid var(--border)',
                                                background: 'rgba(37,99,235,0.04)',
                                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                                transition: 'background 0.2s',
                                                cursor: 'pointer',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,99,235,0.04)'}
                                        >
                                            <div className="status-dot" style={{
                                                marginTop: 5, flexShrink: 0,
                                                background: n.type === 'alert' ? 'var(--danger)' : n.is_read ? 'var(--border-strong)' : 'var(--accent)',
                                            }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{n.title}</div>
                                                {n.body && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{n.body}</div>}
                                            </div>
                                            {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 5 }} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Profile button */}
                    <div id="profile-dropdown" style={{ position: 'relative' }}>
                        <button onClick={() => { setShowProfile(p => !p); setShowNotifs(false); }} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 8px 5px 5px',
                            background: showProfile ? 'var(--bg-tertiary)' : 'transparent',
                            border: '1px solid ' + (showProfile ? 'var(--border)' : 'transparent'),
                            borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                            <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: roleColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                            }}>
                                {initials}
                            </div>
                            <div className="profile-name-text" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.full_name?.split(' ')[0]}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.role}</div>
                            </div>
                            <ChevronDown size={12} color="var(--text-muted)" className="chevron-icon" style={{ transform: showProfile ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>

                        {showProfile && (
                            <div className="animate-slide-down" style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                                width: 220, background: '#fff',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                                zIndex: 2000, overflow: 'hidden',
                            }}>
                                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 2 }}>{user?.full_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                                    <div style={{ marginTop: 8 }}>
                                        <span className="badge" style={{ background: roleColor + '18', color: roleColor }}>
                                            {user?.role?.toUpperCase()}
                                        </span>
                                        {user?.region && <span className="badge badge-gray" style={{ marginLeft: 6 }}>{user.region}</span>}
                                    </div>
                                </div>
                                <div style={{ padding: '6px' }}>
                                    <button onClick={() => { navigate('/settings'); setShowProfile(false); }} style={{
                                        width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                                        background: 'transparent', border: 'none', borderRadius: 6,
                                        cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)',
                                        transition: 'background 0.12s', fontFamily: 'inherit',
                                    }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <Settings size={14} /> Settings
                                    </button>
                                    <button onClick={() => { navigate('/chat'); setShowProfile(false); }} style={{
                                        width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                                        background: 'transparent', border: 'none', borderRadius: 6,
                                        cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)',
                                        transition: 'background 0.12s', fontFamily: 'inherit',
                                    }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <MessageSquare size={14} /> Messages
                                        {chatUnread > 0 && <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>{chatUnread}</span>}
                                    </button>
                                    <button onClick={handleLogout} style={{
                                        width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                                        background: 'transparent', border: 'none', borderRadius: 6,
                                        cursor: 'pointer', fontSize: '0.82rem', color: 'var(--danger)',
                                        transition: 'background 0.12s', fontFamily: 'inherit',
                                    }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-glow)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <LogOut size={14} /> Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile hamburger */}
                    <button
                        className="mobile-menu-btn btn btn-ghost btn-icon"
                        onClick={() => setMobileMenuOpen(p => !p)}
                    >
                        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </header>

            {/* Mobile slide-down nav */}
            {mobileMenuOpen && (
                <div className="mobile-nav" style={{
                    position: 'fixed', top: 'var(--header-height)', left: 0, right: 0,
                    background: '#fff', borderBottom: '1px solid var(--border)',
                    zIndex: 999, padding: '8px 16px 16px',
                    boxShadow: 'var(--shadow-lg)',
                    animation: 'slideDown 0.2s ease',
                }}>
                    {/* Mobile region */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        {REGIONS.map(r => (
                            <button key={r} onClick={() => { onRegionChange(r); setMobileMenuOpen(false); }} style={{
                                padding: '5px 12px', borderRadius: 6,
                                background: region === r ? 'var(--accent)' : 'var(--bg-tertiary)',
                                color: region === r ? '#fff' : 'var(--text-secondary)',
                                border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            }}>{r}</button>
                        ))}
                    </div>
                    {navItems.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            style={{ display: 'flex', width: '100%', marginBottom: 4, position: 'relative' }}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <Icon size={15} />
                            <span style={{ fontSize: '0.85rem' }}>{label}</span>
                            {to === '/chat' && chatUnread > 0 && (
                                <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>{chatUnread}</span>
                            )}
                        </NavLink>
                    ))}
                </div>
            )}
            {/* Alerts Drawer Sidebar */}
            <div className={`alerts-sidebar-overlay ${showAlertsSidebar ? 'open' : ''}`} onClick={() => { setShowAlertsSidebar(false); setShowNewAlert(false); }} />
            <div className={`alerts-sidebar ${showAlertsSidebar ? 'open' : ''}`}>
                <div className="alerts-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={18} color="var(--danger)" />
                        <h4 style={{ margin: 0 }}>Workspace Alerts</h4>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {!showNewAlert && (
                            <button className="btn btn-primary btn-sm btn-icon" onClick={() => setShowNewAlert(true)} style={{ padding: 4 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                            </button>
                        )}
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowAlertsSidebar(false); setShowNewAlert(false); }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div className="alerts-sidebar-content">
                    {showNewAlert && (
                        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                            <h4 style={{ marginBottom: 14 }}>New Alert</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <input className="input" placeholder="Alert title" value={alertTitle} onChange={e => setAlertTitle(e.target.value)} />
                                <textarea className="textarea" placeholder="Describe the issue..." value={alertBody} onChange={e => setAlertBody(e.target.value)} style={{ minHeight: 80 }} />

                                {user?.role === 'admin' && (
                                    <select className="input" value={alertTargetId} onChange={e => setAlertTargetId(e.target.value)}>
                                        <option value="">Target: All (Global)</option>
                                        {agents.map(ag => (
                                            <option key={ag.id} value={ag.id}>Target: {ag.full_name}</option>
                                        ))}
                                    </select>
                                )}

                                <div style={{ display: 'flex', gap: 6 }}>
                                    {(['high', 'critical'] as const).map(p => (
                                        <button
                                            key={p}
                                            className="btn btn-sm"
                                            onClick={() => setAlertPriority(p)}
                                            style={{
                                                background: alertPriority === p ? (p === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)') : 'var(--surface)',
                                                color: alertPriority === p ? (p === 'critical' ? 'var(--danger)' : 'var(--warning)') : 'var(--text-secondary)',
                                                border: `1px solid ${alertPriority === p ? 'currentColor' : 'var(--border)'}`,
                                                flex: 1
                                            }}
                                        >
                                            {p === 'critical' ? '🔴 Critical' : '🟡 High'}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                    <button className="btn btn-primary btn-sm" onClick={handleRaiseAlert} style={{ flex: 1 }}>Raise Alert</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowNewAlert(false)} style={{ flex: 1 }}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!showNewAlert && alerts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No open alerts 🎉</div>
                    )}

                    {!showNewAlert && alerts.map(a => (
                        <div
                            key={a.id}
                            className={a.priority === 'critical' ? 'alert-critical' : 'alert-high'}
                            onClick={async () => {
                                // mark as resolved upon viewing
                                try {
                                    await alertsApi.resolve(a.id);
                                    const res = await alertsApi.list({ status: 'open' });
                                    setAlerts(res.data);
                                } catch { }
                                setShowAlertsSidebar(false);
                                if (a.reference_type === 'task' && a.reference_id) {
                                    navigate(`/workspace?taskId=${a.reference_id}`);
                                } else {
                                    navigate(`/workspace`);
                                }
                            }}
                            style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'transform 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{a.title}</span>
                                <span className={`badge ${a.priority === 'critical' ? 'badge-danger' : 'badge-warning'}`}>
                                    {a.priority.toUpperCase()}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                Raised by: {a.raised_by_name || 'System'}
                            </div>
                            {a.body && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.body}</div>}
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', justifyContent: 'space-between' }}>
                                <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{a.region}</span>
                                {(a.reference_type === 'task' || a.reference_id) && <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>Tap to view task ➔</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};
