import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async ({ email, password }) => {
    setAuthError("");
    const res = await api.post("/auth/login", { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload) => {
    setAuthError("");
    const res = await api.post("/auth/register", payload);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  // Re-reads the account, e.g. after a staff approval.
  const refresh = async () => {
    const res = await api.get("/auth/me");
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, authError, setAuthError, login, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return ctx;
}
