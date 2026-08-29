import { useState } from "react";

import { AGENT_SCOPES, type AgentScope, DEFAULT_SCOPES, SCOPE_LABELS } from "../../domain/scopes";
import type { ApiToken } from "../../hooks/useLinks";
import { classNames } from "../../lib/class-names";
import { formatDate } from "../../lib/dates";

import styles from "./ConnectionsPanel.module.css";

type ApiTokensPanelProps = {
  tokens: ApiToken[];
  freshToken: string;
  onCreate: (label: string, scopes: readonly AgentScope[]) => void;
  onRevoke: (id: string) => void;
  onDismiss: () => void;
};

export function ApiTokensPanel({
  tokens,
  freshToken,
  onCreate,
  onRevoke,
  onDismiss,
}: ApiTokensPanelProps) {
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<readonly AgentScope[]>(DEFAULT_SCOPES);
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function toggle(scope: AgentScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : AGENT_SCOPES.filter((entry) => entry === scope || current.includes(entry)),
    );
  }

  return (
    <>
      <div className={styles.row}>
        <strong>API tokens</strong>
        <small>
          Connect Marquee to an agent over MCP at /mcp. A token can only do what you tick here, and
          reaches nothing else on the account.
        </small>
        <span className={styles.spacer} />
        <input
          className={styles.field}
          value={label}
          maxLength={60}
          placeholder="Token name, e.g. Claude"
          aria-label="Token name"
          onChange={(event) => setLabel(event.target.value)}
        />
        <button
          type="button"
          className={classNames(styles.button, styles.primary)}
          disabled={scopes.length === 0}
          onClick={() => {
            onCreate(label, scopes);
            setLabel("");
            setScopes(DEFAULT_SCOPES);
            setCopied(false);
          }}
        >
          Create
        </button>
      </div>

      <div className={styles.row}>
        <strong>What it may do</strong>
        <ul className={styles.scopes}>
          {AGENT_SCOPES.map((scope) => (
            <li key={scope}>
              <label className={styles.scope}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggle(scope)}
                />
                {SCOPE_LABELS[scope]}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {freshToken && (
        <div className={styles.row}>
          <strong>Copy it now</strong>
          <code className={styles.token}>{freshToken}</code>
          <span className={styles.spacer} />
          <button type="button" className={styles.button} onClick={() => void copy(freshToken)}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className={styles.button} onClick={onDismiss}>
            Done
          </button>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className={styles.tokens}>
          {tokens.map((token) => (
            <li key={token.id}>
              <strong>{token.label}</strong>
              <small>
                {token.lastUsedAt ? `used ${formatDate(token.lastUsedAt, {})}` : "never used"}
                {" · "}
                {token.fullAccess
                  ? "your whole account, mint a scoped one to replace it"
                  : token.scopes.map((scope) => SCOPE_LABELS[scope].toLowerCase()).join(", ")}
              </small>
              <span className={styles.spacer} />
              <button type="button" className={styles.button} onClick={() => onRevoke(token.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
