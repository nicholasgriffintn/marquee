import { useCallback, useEffect, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";
import type { User } from "../types";

type SessionResponse = { user: User | null };

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(authCallbackError);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const session = await requestJson<SessionResponse>("/api/auth/session", {
          signal: controller.signal,
        });

        setUser(session.user);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError("Could not check your sign-in status. Try again in a moment.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => controller.abort();
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestJson("/api/auth/logout", jsonRequest("POST"));
      setUser(null);
      setError("");
    } catch {
      setError("Could not sign you out. Try again.");
    }
  }, []);

  return { error, isLoading, logout, user };
}

const AUTH_ERRORS: Record<string, string> = {
  invalid_callback: "That stub does not match the one I kept. Start again at the box office.",
  provider_not_found: "We do not take that ticket here.",
  identity_conflict: "That seat is already someone else's. Sign in the way you did last time.",
};

function authCallbackError() {
  const parameters = new URLSearchParams(window.location.search);
  const code = parameters.get("authError");

  if (code === null) {
    return "";
  }

  parameters.delete("authError");
  const query = parameters.toString();

  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

  return AUTH_ERRORS[code] ?? "Sign-in did not complete. Try again.";
}
