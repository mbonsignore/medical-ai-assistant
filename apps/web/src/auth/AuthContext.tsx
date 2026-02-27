import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "../api";

export type User = {
  id: string;
  email: string;
  role: "PATIENT" | "DOCTOR";
  patientId: string | null;
  doctorId: string | null;
  createdAt: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    role: "PATIENT" | "DOCTOR";
    name: string;
    specialty?: string;
    bio?: string;
  }) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

const LS_TOKEN = "maa_token";
const LS_USER = "maa_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(LS_TOKEN));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(LS_USER);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    async function boot() {
      try {
        if (!token) return;
        const res = await api.get<User>("/auth/me");
        setUser(res.data);
        localStorage.setItem(LS_USER, JSON.stringify(res.data));
      } catch {
        setToken(null);
        setUser(null);
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_USER);
      } finally {
        setLoading(false);
      }
    }
    boot();
    if (!token) setLoading(false);
  }, []); // run once

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
    localStorage.setItem(LS_TOKEN, res.data.token);
    localStorage.setItem(LS_USER, JSON.stringify(res.data.user));
  }

  async function register(payload: {
    email: string;
    password: string;
    role: "PATIENT" | "DOCTOR";
    name: string;
    specialty?: string;
    bio?: string;
  }) {
    const res = await api.post<{ token: string; user: User }>("/auth/register", payload);
    setToken(res.data.token);
    setUser(res.data.user);
    localStorage.setItem(LS_TOKEN, res.data.token);
    localStorage.setItem(LS_USER, JSON.stringify(res.data.user));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
  }

  const value = useMemo<AuthState>(() => ({ token, user, loading, login, register, logout }), [
    token,
    user,
    loading,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}