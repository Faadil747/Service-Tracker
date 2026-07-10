import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { useNotificationStore } from './store/notificationStore';
import { shouldShowToast } from './utils/notificationPrefs';
import { Header } from './components/shared/Header';
import { ChatWidget } from './components/shared/ChatWidget';
import { LoginPage } from './views/LoginPage';
import { DashboardView } from './views/DashboardView';
import { TaskWorkspaceView } from './views/TaskWorkspaceView';
import { SettingsView } from './views/SettingsView';
import { ContentCalendarView } from './views/ContentCalendarView';
import { LinkAnalyticsView } from './views/LinkAnalyticsView';
import { ReportsView } from './views/ReportsView';
import { EngagementView } from './views/EngagementView';
import { EmployeesView } from './views/EmployeesView';
import './styles/globals.css';

const ProtectedLayout: React.FC<{ roles?: string[]; children: (region: string) => React.ReactNode }> = ({ roles, children }) => {
    const { isAuthenticated, user } = useAuthStore();
    const poll = useNotificationStore((s) => s.poll);
    const [region, setRegion] = useState('Global');
    const firstPoll = useRef(true);

    // Near-realtime notifications: poll every 7s and surface newly arrived ones as toasts.
    useEffect(() => {
        if (!isAuthenticated) return;
        let active = true;
        const tick = async () => {
            const fresh = await poll();
            if (active && !firstPoll.current) {
                fresh.slice(0, 3)
                    .filter((n) => shouldShowToast((n as any).type || ''))
                    .forEach((n) => toast(n.title, { icon: '🔔' }));
            }
            firstPoll.current = false;
        };
        tick();
        const id = setInterval(tick, 7000);
        return () => { active = false; clearInterval(id); };
    }, [isAuthenticated, poll]);

    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const allowed = !roles || (user ? roles.includes(user.role) : false);

    return (
        <div className="app-shell">
            <Header region={region} onRegionChange={setRegion} />
            <div className="main-content">
                {allowed ? children(region) : (
                    <div className="page-content">
                        <div className="empty-state" style={{ padding: '80px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔒</div>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8, color: 'var(--text-primary)' }}>Access restricted</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>You don't have permission to view this page.</div>
                        </div>
                    </div>
                )}
            </div>
            <ChatWidget />
        </div>
    );
};

const App: React.FC = () => {
    const { isAuthenticated } = useAuthStore();

    return (
        <BrowserRouter>
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        background: '#fff',
                        color: '#0f172a',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.08)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        borderRadius: '10px',
                        padding: '12px 16px',
                    },
                    success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                    error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                }}
            />
            <Routes>
                <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
                <Route path="/dashboard" element={
                    <ProtectedLayout>{(r) => <DashboardView region={r} />}</ProtectedLayout>
                } />
                <Route path="/workspace" element={
                    <ProtectedLayout>{(r) => <TaskWorkspaceView region={r} />}</ProtectedLayout>
                } />
                <Route path="/analytics" element={
                    <ProtectedLayout>{() => <Navigate to="/dashboard?view=analytics" replace />}</ProtectedLayout>
                } />
                <Route path="/calendar" element={
                    <ProtectedLayout>{(r) => <ContentCalendarView region={r} />}</ProtectedLayout>
                } />
                <Route path="/links" element={
                    <ProtectedLayout roles={['admin', 'agent', 'developer', 'ceo']}>{(r) => <LinkAnalyticsView region={r} />}</ProtectedLayout>
                } />
                <Route path="/reports" element={
                    <ProtectedLayout roles={['admin', 'developer', 'ceo']}>{(r) => <ReportsView region={r} />}</ProtectedLayout>
                } />
                <Route path="/engagement" element={
                    <ProtectedLayout>{(r) => <EngagementView region={r} />}</ProtectedLayout>
                } />
                <Route path="/employees" element={
                    <ProtectedLayout roles={['admin']}>{(r) => <EmployeesView region={r} />}</ProtectedLayout>
                } />
                {/* Legacy routes → merged into Engagement */}
                <Route path="/progress" element={<ProtectedLayout>{() => <Navigate to="/engagement" replace />}</ProtectedLayout>} />
                <Route path="/accountability" element={<ProtectedLayout>{() => <Navigate to="/engagement" replace />}</ProtectedLayout>} />
                <Route path="/chat" element={
                    <ProtectedLayout>{() => <Navigate to="/dashboard" replace />}</ProtectedLayout>
                } />
                <Route path="/settings" element={
                    <ProtectedLayout roles={['admin', 'agent', 'developer', 'ceo']}>{() => <SettingsView />}</ProtectedLayout>
                } />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
