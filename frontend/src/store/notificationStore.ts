import { create } from 'zustand';
import { Notification } from '../types';
import { notificationsApi } from '../services/api';

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    fetchNotifications: () => Promise<void>;
    fetchCount: () => Promise<void>;
    poll: () => Promise<Notification[]>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,

    fetchNotifications: async () => {
        try {
            const res = await notificationsApi.list();
            set({ notifications: res.data });
        } catch { }
    },

    fetchCount: async () => {
        try {
            const res = await notificationsApi.count();
            set({ unreadCount: res.data.count });
        } catch { }
    },

    // Fetch list + count together and return unread notifications that are newly
    // arrived since the last poll (so the UI can surface them in realtime).
    poll: async () => {
        try {
            const [listRes, countRes] = await Promise.all([
                notificationsApi.list(),
                notificationsApi.count(),
            ]);
            const incoming: Notification[] = listRes.data;
            const prevIds = new Set(get().notifications.map((n) => n.id));
            const fresh = incoming.filter((n) => !n.is_read && !prevIds.has(n.id));
            set({ notifications: incoming, unreadCount: countRes.data.count });
            return fresh;
        } catch {
            return [];
        }
    },

    markRead: async (id) => {
        await notificationsApi.markRead(id);
        set((state) => ({
            notifications: state.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
            unreadCount: Math.max(0, state.unreadCount - 1),
        }));
    },

    markAllRead: async () => {
        await notificationsApi.markAllRead();
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
            unreadCount: 0,
        }));
    },
}));
