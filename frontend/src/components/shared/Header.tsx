import React, { useEffect, useState } from 'react';
import {
    Bell, LogOut, Zap, CheckSquare, LayoutDashboard, TrendingUp,
    Settings, Calendar, Link2, Users, ChevronDown, MessageSquare, Menu, X
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { chatApi } from '../../services/api';

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
            navigate(`/workspace?tab=alerts`);
        } else if (n.reference_type === 'chat' || n.reference_type === 'message') {
            navigate(`?chatWith=${n.reference_id}`);
        }
    };
    const [showNotifs, setShowNotifs] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [chatUnread, setChatUnread] = useState(0);

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
                <nav className="desktop-nav" style={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
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
                    {/* Region pill selector */}
                    <div className="region-selector" style={{
                        display: 'flex', gap: 1, background: 'var(--bg-tertiary)',
                        padding: '3px', borderRadius: 6, border: '1px solid var(--border)',
                    }}>
                        {REGIONS.map(r => (
                            <button key={r} onClick={() => onRegionChange(r)} style={{
                                padding: '4px 9px', border: 'none', borderRadius: 4,
                                background: region === r ? '#fff' : 'transparent',
                                color: region === r ? 'var(--accent)' : 'var(--text-muted)',
                                fontSize: '0.72rem', fontWeight: region === r ? 700 : 400,
                                boxShadow: region === r ? 'var(--shadow-xs)' : 'none',
                                cursor: 'pointer', transition: 'all 0.12s',
                            }}>
                                {r}
                            </button>
                        ))}
                    </div>

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
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🔔</div>
                                            All caught up!
                                        </div>
                                    ) : notifications.slice(0, 15).map((n) => (
                                        <div key={n.id}
                                            onClick={() => handleNotifClick(n)}
                                            style={{
                                                padding: '12px 16px',
                                                borderBottom: '1px solid var(--border)',
                                                background: n.is_read ? 'transparent' : 'rgba(37,99,235,0.04)',
                                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                                transition: 'background 0.2s',
                                                cursor: 'pointer',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                            onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(37,99,235,0.04)'}
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
                        style={{ display: 'none' }}
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
        </>
    );
};
