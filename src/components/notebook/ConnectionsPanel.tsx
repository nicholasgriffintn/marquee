import { useState } from "react";

import { useLinks } from "../../hooks/useLinks";
import { classNames } from "../../lib/class-names";
import { formatDate } from "../../lib/dates";

import styles from "./ConnectionsPanel.module.css";

export function ConnectionsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const connections = useLinks(isSignedIn);
  const [tokenLabel, setTokenLabel] = useState("");
  const [confirmPush, setConfirmPush] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const trakt = connections.links.find((link) => link.provider === "trakt");

  if (!isSignedIn) {
    return null;
  }

  async function copyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setTokenCopied(true);
    } catch {
      setTokenCopied(false);
    }
  }

  return (
    <>
      <div className={styles.row}>
        <strong>Trakt</strong>
        {trakt?.available === false ? (
          <small>Not configured on this deployment.</small>
        ) : trakt?.connected && trakt.needsReconnect ? (
          <>
            <small>
              {trakt.account ? `${trakt.account} needs reconnecting` : "Needs reconnecting"} · Trakt
              stopped accepting our access, so syncing is paused.
            </small>
            <span className={styles.spacer} />
            <a
              className={classNames(styles.button, styles.primary)}
              href="/api/links/trakt/start?returnTo=/notebook"
            >
              Reconnect Trakt
            </a>
            <button
              type="button"
              className={styles.button}
              onClick={() => void connections.unlinkTrakt()}
            >
              Unlink
            </button>
          </>
        ) : trakt?.connected ? (
          <>
            <small>
              {trakt.account ? `Linked as ${trakt.account}` : "Linked"}
              {trakt.syncedAt ? ` · synced ${formatDate(trakt.syncedAt, {})}` : ""}
              {connections.syncStatus === "running" ? " · bringing your history over…" : ""}
              {connections.syncStatus === "timeout"
                ? " · still bringing it over, check back shortly"
                : ""}
              {connections.pushStatus === "running" ? " · sending your shelf over…" : ""}
              {connections.pushStatus === "done" ? " · sent" : ""}
              {connections.pushStatus === "timeout" ? " · still sending, check back shortly" : ""}
            </small>
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.button}
              disabled={connections.syncStatus === "running"}
              onClick={() => void connections.syncTrakt()}
            >
              Bring it here
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={connections.pushStatus === "running"}
              onClick={() => setConfirmPush(true)}
            >
              Send it there
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => void connections.unlinkTrakt()}
            >
              Unlink
            </button>
          </>
        ) : (
          <>
            <small>Import your watch history, ratings and watchlist.</small>
            <span className={styles.spacer} />
            <a
              className={classNames(styles.button, styles.primary)}
              href="/api/links/trakt/start?returnTo=/notebook"
            >
              Connect Trakt
            </a>
          </>
        )}
      </div>

      {confirmPush && trakt?.connected && (
        <div className={styles.row}>
          <strong>Send it there</strong>
          <small>
            {connections.pending
              ? `${connections.pending.watched} watched, ${connections.pending.rated} rated and ${connections.pending.listed} waiting would go onto your Trakt account. Only what has changed since the last send.`
              : "Your shelf would go onto your Trakt account."}
          </small>
          <span className={styles.spacer} />
          <button
            type="button"
            className={classNames(styles.button, styles.primary)}
            onClick={() => {
              void connections.pushTrakt();
              setConfirmPush(false);
            }}
          >
            Send it
          </button>
          <button type="button" className={styles.button} onClick={() => setConfirmPush(false)}>
            Leave it
          </button>
        </div>
      )}

      <div className={styles.row}>
        <strong>API tokens</strong>
        <small>Connect Marquee to an agent over MCP at /mcp.</small>
        <span className={styles.spacer} />
        <input
          className={styles.field}
          value={tokenLabel}
          maxLength={60}
          placeholder="Token name, e.g. Claude"
          aria-label="Token name"
          onChange={(event) => setTokenLabel(event.target.value)}
        />
        <button
          type="button"
          className={classNames(styles.button, styles.primary)}
          onClick={() => {
            void connections.createToken(tokenLabel);
            setTokenLabel("");
            setTokenCopied(false);
          }}
        >
          Create
        </button>
      </div>
      {connections.freshToken && (
        <div className={styles.row}>
          <strong>Copy it now</strong>
          <code className={styles.token}>{connections.freshToken}</code>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.button}
            onClick={() => void copyToken(connections.freshToken ?? "")}
          >
            {tokenCopied ? "Copied" : "Copy"}
          </button>
          <button type="button" className={styles.button} onClick={connections.dismissToken}>
            Done
          </button>
        </div>
      )}
      {connections.tokens.length > 0 && (
        <ul className={styles.tokens}>
          {connections.tokens.map((token) => (
            <li key={token.id}>
              <strong>{token.label}</strong>
              <small>
                {token.lastUsedAt ? `used ${formatDate(token.lastUsedAt, {})}` : "never used"}
              </small>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.button}
                onClick={() => void connections.revokeToken(token.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {connections.error && (
        <div className={styles.row}>
          <p role="alert">{connections.error}</p>
        </div>
      )}
    </>
  );
}
