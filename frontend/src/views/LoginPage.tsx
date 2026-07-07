import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Lock, Mail, ArrowRight, Activity, Globe, Users, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const DEMO_ACCOUNTS = [
    { role: 'Admin', email: 'admin@gorecruitai.com', password: 'Admin@123', bg: '#f3e8ff', color: '#7e22ce' },
    { role: 'Agent', email: 'priya@gorecruitai.com', password: 'Agent@123', bg: '#e0f2fe', color: '#0369a1' },
    { role: 'Developer', email: 'dev@gorecruitai.com', password: 'Dev@1234', bg: '#ecfdf5', color: '#047857' },
];

const SLIDES = [
    {
        id: 1,
        title: "GOrecruitAI Service Tracker",
        subtitle: "The ultimate LinkedIn Management Platform for HR. Automate, track, and scale your employer branding.",
        image: "url('https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=1200&auto=format&fit=crop')",
        overlay: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,58,138,0.75) 100%)",
        icon: <Activity size={32} color="#60a5fa" />
    },
    {
        id: 2,
        title: "Agent Accountability Hub",
        subtitle: "Assign LinkedIn posting goals, review pending content approvals, and seamlessly track daily agent task metrics.",
        image: "url('https://images.unsplash.com/photo-1600880292203-757bb62b4baf?q=80&w=1200&auto=format&fit=crop')",
        overlay: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(76,29,149,0.75) 100%)",
        icon: <Users size={32} color="#a78bfa" />
    },
    {
        id: 3,
        title: "AI & Engagement Insights",
        subtitle: "Generate dynamic posts using DeepSeek AI engine while monitoring follower growth and regional analytics.",
        image: "url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop')",
        overlay: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(6,78,59,0.75) 100%)",
        icon: <Globe size={32} color="#34d399" />
    }
];

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [activeSlide, setActiveSlide] = useState(0);
    const { login, isLoading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    // Faster Animation Cycle
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSlide(s => (s + 1) % SLIDES.length);
        }, 3500);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        try {
            await login(email, password);
            toast.success('Authentication successful');
            navigate('/dashboard');
        } catch { }
    };

    const quickLogin = async (e: string, p: string) => {
        clearError();
        try {
            await login(e, p);
            toast.success('Authentication successful');
            navigate('/dashboard');
        } catch { }
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f172a', overflow: 'hidden', fontFamily: '"Inter", sans-serif' }}>

            {/* Left Column (3/4 - Premium Carousel) */}
            <div style={{
                flex: 3,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                color: '#ffffff',
                padding: '60px'
            }}>
                {/* Top Left Logo */}
                <div style={{ position: 'absolute', top: 40, left: 40, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={22} color="#ffffff" strokeWidth={2.5} />
                    </div>
                    <div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', letterSpacing: '0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.5)', lineHeight: 1.1 }}>
                            Service Tracker
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500, letterSpacing: '0.01em', marginTop: 2 }}>
                            GOrecruitAI LinkedIn Management Platform
                        </div>
                    </div>
                </div>

                {SLIDES.map((slide, i) => (
                    <div
                        key={slide.id}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `${slide.overlay}, ${slide.image}`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            opacity: activeSlide === i ? 1 : 0,
                            transition: 'opacity 0.6s ease-in-out',
                            zIndex: 1,
                        }}
                    >
                        {/* Decorative floating shapes */}
                        <div style={{
                            position: 'absolute',
                            top: '-10%', right: '-10%', width: '40vw', height: '40vw',
                            background: 'rgba(255,255,255,0.03)', borderRadius: '50%',
                            filter: 'blur(60px)', transform: `scale(${activeSlide === i ? 1.05 : 0.95})`,
                            transition: 'transform 4s ease'
                        }} />
                    </div>
                ))}

                <div style={{ zIndex: 10, maxWidth: 840, width: '100%', position: 'relative' }}>
                    <div style={{ position: 'relative', height: 340 }}>
                        {SLIDES.map((slide, i) => (
                            <div
                                key={slide.id}
                                style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0,
                                    opacity: activeSlide === i ? 1 : 0,
                                    transform: `translateY(${activeSlide === i ? '0' : '20px'})`,
                                    transition: 'all 0.5s cubic-bezier(0.2, 0, 0, 1)',
                                    pointerEvents: activeSlide === i ? 'auto' : 'none',
                                }}
                            >
                                <div style={{
                                    width: 72, height: 72, borderRadius: 20,
                                    background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 32, border: '1px solid rgba(255,255,255,0.1)',
                                }}>
                                    {slide.icon}
                                </div>
                                <h1 style={{
                                    fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', fontWeight: 700,
                                    lineHeight: 1.15, marginBottom: 20, color: '#ffffff',
                                    letterSpacing: '-0.02em', textShadow: '0 2px 20px rgba(0,0,0,0.3)'
                                }}>
                                    {slide.title}
                                </h1>
                                <p style={{
                                    fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', color: '#cbd5e1',
                                    maxWidth: 680, lineHeight: 1.6, fontWeight: 400,
                                    textShadow: '0 2px 10px rgba(0,0,0,0.4)'
                                }}>
                                    {slide.subtitle}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Carousel Indicators */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                        {SLIDES.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveSlide(i)}
                                style={{
                                    width: activeSlide === i ? 36 : 10,
                                    height: 10,
                                    borderRadius: 5,
                                    background: '#ffffff',
                                    border: 'none',
                                    opacity: activeSlide === i ? 1 : 0.2,
                                    transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
                                    cursor: 'pointer'
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Column (1/4 - Light Modern Login) */}
            <div style={{
                flex: 1,
                minWidth: 420,
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                padding: '60px 40px',
                zIndex: 10,
                boxShadow: '-20px 0 40px rgba(0,0,0,0.2)',
                justifyContent: 'center'
            }}>
                <div style={{ maxWidth: 360, width: '100%', margin: '0 auto' }}>

                    <div style={{ marginBottom: 40 }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: 8, letterSpacing: '-0.02em' }}>
                            Sign in to Platform
                        </h2>
                        <p style={{ color: '#4b5563', fontSize: '0.95rem' }}>Securely access your workspace credentials.</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Corporate Email
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input
                                    className="input-light"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@gorecruitai.com"
                                    required
                                    style={{ paddingLeft: 42, height: 48, fontSize: '0.95rem', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', width: '100%', outline: 'none' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 28 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input
                                    className="input-light"
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{ paddingLeft: 42, paddingRight: 44, height: 48, fontSize: '0.95rem', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', width: '100%', outline: 'none' }}
                                />
                                <button type="button" onClick={() => setShowPass((p) => !p)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', color: '#b91c1c', fontSize: '0.85rem', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{ width: '100%', height: 48, fontSize: '0.95rem', fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }}
                        >
                            {isLoading ? 'Authenticating...' : 'Sign In'} <ArrowRight size={16} />
                        </button>
                    </form>

                    <div style={{ marginTop: 40, paddingTop: 30, borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Demo Portal Access
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {DEMO_ACCOUNTS.map(({ role, email: e, password: p, bg, color }) => (
                                <button
                                    key={role}
                                    onClick={() => quickLogin(e, p)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: '#ffffff', border: '1px solid #e5e7eb',
                                        height: 44, borderRadius: 8, padding: '0 16px',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                    onMouseOver={(ev) => ev.currentTarget.style.background = '#f9fafb'}
                                    onMouseOut={(ev) => ev.currentTarget.style.background = '#ffffff'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ background: bg, color: color, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>{role}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{e}</span>
                                        <ChevronRight size={14} color="#9ca3af" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
