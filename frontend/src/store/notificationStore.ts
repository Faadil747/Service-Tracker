import { create } from 'zustand';
import { Notification } from '../types';
import { notificationsApi } from '../services/api';

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    fetchNotifications: () => Promise<void>;
    fetchCount: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
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
