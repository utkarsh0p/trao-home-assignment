"use client";

// One /api/auth/me call per page load, shared by the header and anything else that
// needs to know who is signed in. The JWT lives in an httpOnly cookie, so there is
// nothing readable to hydrate from — the client has to ask.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMe } from "@/lib/api";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ status: "loading", user: null });

  useEffect(() => {
    const controller = new AbortController();

    getMe(controller.signal)
      .then((user) => setSession({ status: "authenticated", user }))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        // Every failure resolves to signed out, including an unreachable backend.
        // The landing page must render for a visitor whether or not the API is awake.
        setSession({ status: "unauthenticated", user: null });
      });

    return () => controller.abort();
  }, []);

  // The seam the sign-in and sign-out screens will use, so they don't re-fetch /me.
  const setUser = useCallback((user) => {
    setSession(
      user
        ? { status: "authenticated", user }
        : { status: "unauthenticated", user: null },
    );
  }, []);

  return (
    <SessionContext.Provider value={{ ...session, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a SessionProvider");
  return value;
}
