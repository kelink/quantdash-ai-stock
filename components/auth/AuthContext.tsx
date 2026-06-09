import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { loginUser, registerUser, logoutUser, fetchCurrentUser } from '../../services/authService';
import { getStoredAuthToken, saveStoredAuthToken, clearStoredAuthToken } from '../../services/authStorage';

interface AuthState {
  token: string | null;
  username: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from stored token on mount
  useEffect(() => {
    const storedToken = getStoredAuthToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }

    fetchCurrentUser(storedToken)
      .then((user) => {
        setToken(storedToken);
        setUsername(user.username);
      })
      .catch(() => {
        clearStoredAuthToken();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (loginUsername: string, password: string) => {
    const res = await loginUser(loginUsername, password);
    saveStoredAuthToken(res.token);
    setToken(res.token);
    setUsername(res.username);
  }, []);

  const register = useCallback(async (regUsername: string, password: string) => {
    const res = await registerUser(regUsername, password);
    saveStoredAuthToken(res.token);
    setToken(res.token);
    setUsername(res.username);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try { await logoutUser(token); } catch { /* ignore */ }
    }
    clearStoredAuthToken();
    setToken(null);
    setUsername(null);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!token && !!username,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
