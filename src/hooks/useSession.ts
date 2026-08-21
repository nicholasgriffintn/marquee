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

function authCallbackError() {
  const parameters = new URLSearchParams(window.location.search);

  if (!parameters.has("authError")) {
    return "";
  }

  parameters.delete("authError");
  const query = parameters.toString();

  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

  return "GitHub sign-in did not complete. Please try again.";
}
