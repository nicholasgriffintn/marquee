import { useState } from "react";

import { useLinks } from "../../hooks/useLinks";
import { classNames } from "../../lib/class-names";
import { formatDate } from "../../lib/dates";
import { ApiTokensPanel } from "./ApiTokensPanel";

import styles from "./ConnectionsPanel.module.css";

export function ConnectionsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const connections = useLinks(isSignedIn);
  const [confirmPush, setConfirmPush] = useState(false);
  const trakt = connections.links.find((link) => link.provider === "trakt");

  if (!isSignedIn) {
    return null;
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

      <ApiTokensPanel
        tokens={connections.tokens}
        freshToken={connections.freshToken}
        onCreate={(label, scopes) => void connections.createToken(label, scopes)}
        onRevoke={(id) => void connections.revokeToken(id)}
        onDismiss={connections.dismissToken}
      />

      {connections.error && (
        <div className={styles.row}>
          <p role="alert">{connections.error}</p>
        </div>
      )}
    </>
  );
}
