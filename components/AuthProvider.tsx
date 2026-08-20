"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabaseBrowserAuth } from "@/lib/supabase-auth-browser";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => undefined,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/account") {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (searchParams.has("error") || searchParams.has("error_code") || hashParams.has("error") || hashParams.has("error_code")) {
        window.location.replace(`/account${window.location.search}${window.location.hash}`);
        return;
      }
    }

    const client = supabaseBrowserAuth();
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;
    void client.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (!active) return;
      setSession(result.data.session);
      setLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const client = supabaseBrowserAuth();
    return {
      user: session?.user || null,
      session,
      loading,
      signOut: async () => {
        if (client) await client.auth.signOut();
      },
      refresh: async () => {
        if (!client) return;
        const { data } = await client.auth.getSession();
        setSession(data.session);
      },
    };
  }, [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
