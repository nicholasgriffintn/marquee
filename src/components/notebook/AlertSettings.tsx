import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { classNames } from "../../lib/class-names";
import { jsonMutation, mutateJson, queryJson } from "../../lib/query-client";
import { Button } from "../../ui";
import { NotebookGroup } from "./NotebookSection";

import styles from "./AlertSettings.module.css";

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
    hint: "Only at the preferred cinema and location saved above.",
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

    let active = true;

    async function load() {
      try {
        const response = await queryJson<AlertConfig>("/api/notebook/alerts");

        if (active) {
          setConfig(response);
          setDraft(response.email);
        }
      } catch {
        if (active) {
          setConfig({ email: "", verified: false, kinds: [] });
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [isSignedIn]);

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
      await mutateJson("/api/notebook/alerts/email", jsonMutation("POST", { email }));
      setStatus(`I have written to ${email}. Say it is you and I will start.`);
      setConfig((current) => (current ? { ...current, email, verified: false } : current));
    } catch {
      setStatus("I could not get word to that address.");
    }
  }

  async function toggle(kind: string, enabled: boolean) {
    try {
      const response = await mutateJson<{ kinds: AlertKindRow[] }>(
        "/api/notebook/alerts/settings",
        jsonMutation("POST", { kind, enabled }),
      );

      setConfig((current) => (current ? { ...current, kinds: response.kinds } : current));
    } catch {
      setStatus("That switch did not take.");
    }
  }

  return (
    <NotebookGroup
      heading="When I should write to you"
      lede="I will only write about things you have already put on your shelf, never more than a handful a week, and never twice about the same thing."
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void saveAddress();
        }}
      >
        <input
          className={styles.address}
          type="email"
          value={draft}
          maxLength={200}
          placeholder="you@example.com"
          aria-label="Where I should write"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          variant="primary"
          size="lg"
          type="submit"
          className={styles.submit}
          disabled={!draft.trim()}
        >
          {config.email ? "Change the address" : "Use this address"}
        </Button>
        <span className={classNames(styles.state, config.verified && styles.confirmed)}>
          {config.email ? (config.verified ? "Confirmed" : "Not confirmed yet") : "No address"}
        </span>
      </form>

      {(status || confirmation) && (
        <p className={styles.status} aria-live="polite">
          {status || CONFIRM_COPY[confirmation] || ""}
          {confirmation && (
            <button type="button" className={styles.dismiss} onClick={clearConfirmation}>
              Right you are
            </button>
          )}
        </p>
      )}

      <ul className={styles.kinds}>
        {config.kinds.map((row) => (
          <li key={row.kind}>
            <label>
              <input
                type="checkbox"
                checked={row.enabled}
                aria-label={KIND_COPY[row.kind]?.label ?? row.kind}
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
    </NotebookGroup>
  );
}
