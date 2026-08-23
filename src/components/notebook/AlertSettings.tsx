import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { jsonRequest, requestJson } from "../../lib/api";

type AlertKindRow = { kind: string; enabled: boolean };

type AlertConfig = { email: string; verified: boolean; kinds: AlertKindRow[] };

const KIND_COPY: Record<string, { label: string; hint: string }> = {
  season: {
    label: "A series you follow comes back",
    hint: "One note per series, never per episode.",
  },
  arrival: {
    label: "Something on your shelf starts streaming",
    hint: "Only on a service you can watch it with.",
  },
  cinema: {
    label: "Something on your shelf is on a real screen",
    hint: "Within the week, nearest date first.",
  },
  person: {
    label: "Someone you follow has something new",
    hint: "Drawn from the names in your notebook.",
  },
};

const CONFIRM_COPY: Record<string, string> = {
  confirmed: "That address is confirmed. I will write when there is something worth writing about.",
  expired: "That link had gone cold. Ask me for another.",
  invalid: "I did not recognise that link.",
};

export function AlertSettings({ isSignedIn }: { isSignedIn: boolean }) {
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const confirmation = params.get("alertEmail") ?? "";

  function clearConfirmation() {
    const next = new URLSearchParams(params);

    next.delete("alertEmail");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<AlertConfig>("/api/notebook/alerts", {
          signal: controller.signal,
        });

        setConfig(response);
        setDraft(response.email);
      } catch {
        setConfig({ email: "", verified: false, kinds: [] });
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn, confirmation]);

  if (!isSignedIn || !config) {
    return null;
  }

  async function saveAddress() {
    const email = draft.trim();

    if (!email) {
      return;
    }

    setStatus("Sending word…");

    try {
      await requestJson("/api/notebook/alerts/email", jsonRequest("POST", { email }));
      setStatus(`I have written to ${email}. Say it is you and I will start.`);
      setConfig((current) => (current ? { ...current, email, verified: false } : current));
    } catch {
      setStatus("I could not get word to that address.");
    }
  }

  async function toggle(kind: string, enabled: boolean) {
    try {
      const response = await requestJson<{ kinds: AlertKindRow[] }>(
        "/api/notebook/alerts/settings",
        jsonRequest("POST", { kind, enabled }),
      );

      setConfig((current) => (current ? { ...current, kinds: response.kinds } : current));
    } catch {
      setStatus("That switch did not take.");
    }
  }

  return (
    <div className="notebook-group">
      <h2>When I should write to you</h2>
      <p className="notebook-lede">
        I will only write about things you have already put on your shelf, never more than a handful
        a week, and never twice about the same thing.
      </p>

      <form
        className="notebook-guest-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveAddress();
        }}
      >
        <input
          type="email"
          value={draft}
          maxLength={200}
          placeholder="you@example.com"
          aria-label="Where I should write"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="notebook-primary" disabled={!draft.trim()}>
          {config.email ? "Change the address" : "Use this address"}
        </button>
        <span className={`alert-state${config.verified ? " confirmed" : ""}`}>
          {config.email ? (config.verified ? "Confirmed" : "Not confirmed yet") : "No address"}
        </span>
      </form>

      {(status || confirmation) && (
        <p className="notebook-import-status">
          {status || CONFIRM_COPY[confirmation] || ""}
          {confirmation && (
            <button type="button" className="alert-dismiss" onClick={clearConfirmation}>
              Right you are
            </button>
          )}
        </p>
      )}

      <ul className="alert-kinds">
        {config.kinds.map((row) => (
          <li key={row.kind}>
            <label>
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(event) => void toggle(row.kind, event.target.checked)}
              />
              <span>
                <strong>{KIND_COPY[row.kind]?.label ?? row.kind}</strong>
                <small>{KIND_COPY[row.kind]?.hint ?? ""}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
