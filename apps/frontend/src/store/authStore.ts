import { create } from 'zustand';

interface User {
  id: number;
  email: string;
  name: string;
  roles: string[];
  department?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('auth_token'),
  isAuthenticated: !!localStorage.getItem('auth_token'),

  login: async (email: string, password: string) => {
    try {
      const { default: apiClient } = await import('../lib/apiClient');
      const response = await apiClient.post('/admin/auth/login', { email, password });
      const { access_token, user } = response.data;
      localStorage.setItem('auth_token', access_token);
      set({
        token: access_token,
        isAuthenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: [user.role],
          department: user.department
        }
      });
    } catch (error: any) {
      localStorage.removeItem('auth_token');
      set({ user: null, token: null, isAuthenticated: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user: User) => {
    set({ user });
  },
}));
