import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Auto-attach JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 globally
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            localStorage.removeItem('auth-storage');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
    login: (email: string, password: string) =>
        api.post('/api/auth/login', new URLSearchParams({ username: email, password }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
    me: () => api.get('/api/auth/me'),
    register: (data: object) => api.post('/api/auth/register', data),
};

// ── Users ─────────────────────────────────────────────────────────────────
export const usersApi = {
    list: (params?: object) => api.get('/api/users/', { params }),
    create: (data: object) => api.post('/api/users/', data),
    remove: (id: string) => api.delete(`/api/users/${id}`),
    stats: (id: string) => api.get(`/api/users/${id}/stats`),
    updateProfile: (data: object) => api.put('/api/users/me', data),
    resetCredentials: (id: string) => api.post(`/api/users/${id}/reset-credentials`),
};

// ── Tasks ─────────────────────────────────────────────────────────────────
export const tasksApi = {
    list: (params?: object) => api.get('/api/tasks/', { params }),
    create: (data: object) => api.post('/api/tasks/', data),
    approve: (id: string, data: object) => api.post(`/api/tasks/${id}/approve`, data),
    accept: (id: string) => api.post(`/api/tasks/${id}/accept`),
    complete: (id: string, notes?: string) => api.post(`/api/tasks/${id}/complete`, null, { params: { notes } }),
    pendingApprovals: () => api.get('/api/tasks/pending-approvals'),
    accountability: (region?: string) => api.get('/api/tasks/accountability', { params: { region } }),
    assign: (id: string, agentId: string) => api.post(`/api/tasks/${id}/assign`, null, { params: { agent_id: agentId } }),
    delete: (id: string) => api.delete(`/api/tasks/${id}`),
    updateStatus: (id: string, status: string) => api.put(`/api/tasks/${id}/status`, null, { params: { status } }),
};

// ── Posts ─────────────────────────────────────────────────────────────────
export const postsApi = {
    list: (params?: object) => api.get('/api/posts/', { params }),
    create: (data: object) => api.post('/api/posts/', data),
    update: (id: string, data: object) => api.put(`/api/posts/${id}`, data),
    approve: (id: string, data: object) => api.post(`/api/posts/${id}/approve`, data),
    publish: (id: string) => api.post(`/api/posts/${id}/publish`),
    saveLink: (id: string, data: object) => api.post(`/api/posts/${id}/save-link`, data),
    syncMetrics: (id: string) => api.post(`/api/posts/${id}/sync-metrics`),
    kanban: (region?: string, agentId?: string) => api.get('/api/posts/kanban', { params: { region, agent_id: agentId } }),
    moveKanban: (id: string, status: string) => api.post(`/api/posts/${id}/move-kanban`, null, { params: { new_status: status } }),
    delete: (id: string) => api.delete(`/api/posts/${id}`),
};

// ── AI ────────────────────────────────────────────────────────────────────
export const aiApi = {
    generatePost: (data: object) => api.post('/api/ai/generate-post', data),
    predictReach: (data: object) => api.post('/api/ai/predict-reach', data),
    hashtags: (topic: string, region?: string) => api.post('/api/ai/hashtags', null, { params: { topic, region } }),
    sentiment: (comment: string) => api.post('/api/ai/sentiment', { comment }),
    trendingTopics: (region?: string) => api.get('/api/ai/trending-topics', { params: { region } }),
};

// ── Metrics ───────────────────────────────────────────────────────────────
export const metricsApi = {
    // Real LinkedIn company-page snapshot (cached, throttle-aware, real-only).
    linkedinOverview: (force?: boolean) => api.get('/api/metrics/linkedin-overview', { params: { force } }),
    linkedinPosts: (count?: number) => api.get('/api/metrics/linkedin-posts', { params: { count } }),
    posts: (params?: object) => api.get('/api/metrics/posts', { params }),
    demographics: (params?: object) => api.get('/api/metrics/demographics', { params }),
    dashboardSummary: (region?: string) => api.get('/api/metrics/dashboard-summary', { params: { region } }),
    syncPage: (region?: string) => api.post('/api/metrics/sync-page', null, { params: { region } }),
    // Deprecated (LinkedIn exposes no daily history to this token) — kept for compat.
    page: (params?: object) => api.get('/api/metrics/page', { params }),
    bestTime: (region?: string) => api.get('/api/metrics/best-time', { params: { region } }),
};

// ── Notifications ─────────────────────────────────────────────────────────
export const notificationsApi = {
    list: (unread?: boolean) => api.get('/api/notifications/', { params: { unread_only: unread } }),
    count: () => api.get('/api/notifications/count'),
    markRead: (id: string) => api.post(`/api/notifications/${id}/read`),
    markAllRead: () => api.post('/api/notifications/mark-all-read'),
};

// ── Alerts ────────────────────────────────────────────────────────────────
export const alertsApi = {
    list: (params?: object) => api.get('/api/alerts/', { params }),
    create: (data: object) => api.post('/api/alerts/', data),
    resolve: (id: string) => api.post(`/api/alerts/${id}/resolve`),
};

// ── Link Tracking ─────────────────────────────────────────────────────────
export const linksApi = {
    list: (params?: object) => api.get('/api/links/', { params }),
    create: (data: object) => api.post('/api/links/shorten', data),
    analytics: (id: string) => api.get(`/api/links/${id}/analytics`),
    clicks: (params?: object) => api.get('/api/links/clicks/summary', { params }),
};

// ── Settings ──────────────────────────────────────────────────────────────
export const settingsApi = {
    get: () => api.get('/api/settings/'),
    apiConfigs: () => api.get('/api/settings/api-config'),
    upsertApiConfig: (data: object) => api.post('/api/settings/api-config', data),
    linkedinStatus: () => api.get('/api/settings/linkedin-status'),
    deepseekStatus: () => api.get('/api/settings/deepseek-status'),
};

// ── Chat (localStorage-backed, no backend required) ───────────────────────
export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    receiverName: string;
    text: string;
    timestamp: string;
    read: boolean;
}

const CHAT_KEY = 'chat_messages_v2';

function getAllMessages(): ChatMessage[] {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch { return []; }
}

function saveMessages(msgs: ChatMessage[]) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
}

export const chatApi = {
    getMessages: (userId: string, peerId: string): ChatMessage[] => {
        const all = getAllMessages();
        return all.filter(m =>
            (m.senderId === userId && m.receiverId === peerId) ||
            (m.senderId === peerId && m.receiverId === userId)
        ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    },
    sendMessage: (senderId: string, senderName: string, receiverId: string, receiverName: string, text: string): ChatMessage => {
        const msg: ChatMessage = {
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            senderId, senderName, receiverId, receiverName, text,
            timestamp: new Date().toISOString(),
            read: false,
        };
        const all = getAllMessages();
        all.push(msg);
        saveMessages(all);
        return msg;
    },
    getConversations: (userId: string) => {
        const all = getAllMessages();
        const peerMap = new Map<string, { peerName: string; messages: ChatMessage[] }>();
        for (const m of all) {
            if (m.senderId === userId || m.receiverId === userId) {
                const peerId = m.senderId === userId ? m.receiverId : m.senderId;
                const peerName = m.senderId === userId ? m.receiverName : m.senderName;
                if (!peerMap.has(peerId)) peerMap.set(peerId, { peerName, messages: [] });
                peerMap.get(peerId)!.messages.push(m);
            }
        }
        return Array.from(peerMap.entries()).map(([peerId, { peerName, messages }]) => {
            const sorted = [...messages].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            return {
                peerId,
                peerName,
                lastMsg: sorted[0],
                unread: messages.filter(m => m.receiverId === userId && !m.read).length,
            };
        }).sort((a, b) => (b.lastMsg?.timestamp || '').localeCompare(a.lastMsg?.timestamp || ''));
    },
    markRead: (userId: string, peerId: string) => {
        const all = getAllMessages().map(m =>
            m.receiverId === userId && m.senderId === peerId ? { ...m, read: true } : m
        );
        saveMessages(all);
    },
    getUnreadCount: (userId: string): number => {
        return getAllMessages().filter(m => m.receiverId === userId && !m.read).length;
    },
};

export default api;
