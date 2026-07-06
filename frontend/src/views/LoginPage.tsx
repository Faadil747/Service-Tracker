import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const DEMO_ACCOUNTS = [
    { role: 'Admin', email: 'admin@gorecruitai.com', password: 'Admin@123', color: 'var(--purple)' },
    { role: 'Agent', email: 'priya@gorecruitai.com', password: 'Agent@123', color: 'var(--accent)' },
    { role: 'Developer', email: 'dev@gorecruitai.com', password: 'Dev@1234', color: 'var(--info)' },
];

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const { login, isLoading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        try {
            await login(email, password);
            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch { }
    };

    const quickLogin = async (e: string, p: string) => {
        clearError();
        try {
            await login(e, p);
            toast.success('Logged in!');
            navigate('/dashboard');
        } catch { }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'var(--bg-primary)',
            position: 'relative',
        }}>
            <div style={{ width: '100%', maxWidth: 420, zIndex: 1 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 12,
                        background: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: 'var(--shadow-sm)',
                    }}>
                        <Zap size={28} color="#ffffff" strokeWidth={2.5} />
                    </div>
                    <h1 style={{ fontSize: '1.6rem', marginBottom: 4, color: 'var(--text-primary)', fontWeight: 800 }}>
                        Service Tracker
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>GOrecruitAI LinkedIn Management Platform</p>
                </div>

                {/* Login form */}
                <div className="glass-card" style={{ padding: 28 }}>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Email Address
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    className="input"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@gorecruitai.com"
                                    required
                                    style={{ paddingLeft: 38 }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    className="input"
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{ paddingLeft: 38, paddingRight: 40 }}
                                />
                                <button type="button" onClick={() => setShowPass((p) => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: '0.8rem', marginBottom: 16 }}>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary w-full btn-lg" disabled={isLoading}>
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    {/* Demo accounts */}
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12 }}>
                            Quick Demo Access
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {DEMO_ACCOUNTS.map(({ role, email: e, password: p, color }) => (
                                <button
                                    key={role}
                                    className="btn btn-secondary"
                                    onClick={() => quickLogin(e, p)}
                                    style={{ justifyContent: 'space-between' }}
                                >
                                    <span style={{ color }}>{role}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
