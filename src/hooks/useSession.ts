import { useCallback, useState } from "react";

import { jsonMutation, mutateJson, queryClient } from "../lib/query-client";
import type { User } from "../types";
import { useResource } from "./useResource";

type SessionResponse = { user: User | null };

export function useSession() {
  const [signedOut, setSignedOut] = useState(false);
  const [issue, setIssue] = useState(authCallbackError);
  const { data, error, isLoading } = useResource<SessionResponse>("/api/auth/session", {
    enabled: !signedOut,
    errorMessage: "Could not check your sign-in status. Try again in a moment.",
  });

  const logout = useCallback(async () => {
    try {
      await mutateJson("/api/auth/logout", jsonMutation("POST"));
      setSignedOut(true);
      queryClient.clear();
      setIssue("");
    } catch {
      setIssue("Could not sign you out. Try again.");
    }
  }, []);

  return {
    error: issue || error,
    isLoading,
    logout,
    user: signedOut ? null : (data?.user ?? null),
  };
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
