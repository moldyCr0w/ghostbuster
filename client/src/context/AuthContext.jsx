import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // user: undefined = still loading | null = not logged in | object = logged in
  const [user, setUser]               = useState(undefined);
  const [requiresAuth, setRequiresAuth] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data.user ?? null);
      setRequiresAuth(!!data.requiresAuth);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, requiresAuth, setUser, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
