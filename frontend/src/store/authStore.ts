import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    setUser: (user: User) => void;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            login: async (email, password) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await authApi.login(email, password);
                    const { access_token, user } = res.data;
                    localStorage.setItem('access_token', access_token);
                    set({ token: access_token, user, isAuthenticated: true, isLoading: false });
                } catch (err: any) {
                    const msg = err.response?.data?.detail || 'Login failed. Please check your credentials.';
                    set({ error: msg, isLoading: false });
                    throw err;
                }
            },

            logout: () => {
                localStorage.removeItem('access_token');
                set({ user: null, token: null, isAuthenticated: false, error: null });
            },

            setUser: (user) => set({ user }),
            clearError: () => set({ error: null }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
        }
    )
);
