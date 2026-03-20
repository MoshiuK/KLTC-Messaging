import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { User } from "../types";
import { api, SESSION_EXPIRED_EVENT } from "../api/client";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => void;
  loading: boolean;
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (token) {
      const controller = new AbortController();
      api
        .getMe()
        .then((u) => {
          if (!controller.signal.aborted) setUser(u);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            localStorage.removeItem("token");
            setToken(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    } else {
      setLoading(false);
    }
  }, [token]);

  // Listen for session expiry events from the API client
  useEffect(() => {
    const handleSessionExpired = () => {
      setSessionExpired(true);
      localStorage.removeItem("token");
      setToken(null);
      setUser(null);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setSessionExpired(false);
    const res = await api.login(email, password);
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) => {
    setSessionExpired(false);
    const res = await api.register(data);
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setSessionExpired(false);
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, sessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
