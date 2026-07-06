import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { Header } from './components/shared/Header';
import { ChatWidget } from './components/shared/ChatWidget';
import { LoginPage } from './views/LoginPage';
import { DashboardView } from './views/DashboardView';
import { TaskWorkspaceView } from './views/TaskWorkspaceView';
import { AgentProgressView } from './views/AgentProgressView';
import { SettingsView } from './views/SettingsView';
import { ContentCalendarView } from './views/ContentCalendarView';
import { LinkAnalyticsView } from './views/LinkAnalyticsView';
import { AccountabilityView } from './views/AccountabilityView';
import './styles/globals.css';

const ProtectedLayout: React.FC<{ children: (region: string) => React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    const [region, setRegion] = useState('Global');

    if (!isAuthenticated) return <Navigate to="/login" replace />;

    return (
        <div className="app-shell">
            <Header region={region} onRegionChange={setRegion} />
            <div className="main-content">
                {children(region)}
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
                    <ProtectedLayout>{(r) => <LinkAnalyticsView region={r} />}</ProtectedLayout>
                } />
                <Route path="/progress" element={
                    <ProtectedLayout>{(r) => <AgentProgressView region={r} />}</ProtectedLayout>
                } />
                <Route path="/accountability" element={
                    <ProtectedLayout>{(r) => <AccountabilityView region={r} />}</ProtectedLayout>
                } />
                <Route path="/chat" element={
                    <ProtectedLayout>{() => <Navigate to="/dashboard" replace />}</ProtectedLayout>
                } />
                <Route path="/settings" element={
                    <ProtectedLayout>{() => <SettingsView />}</ProtectedLayout>
                } />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
