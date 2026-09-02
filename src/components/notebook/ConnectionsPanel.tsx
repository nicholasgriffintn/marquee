import { useState } from "react";

import { useLinks } from "../../hooks/useLinks";
import { classNames } from "../../lib/class-names";
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
      {trakt?.connected && (
        <div className={styles.row}>
          <strong>Trakt connection</strong>
          <small>
            {trakt.account ? `Connected as ${trakt.account}` : "Connected"}
            {trakt.needsReconnect ? " · needs reconnecting" : ""}
            {connections.pushStatus === "running" ? " · sending your shelf…" : ""}
            {connections.pushStatus === "done" ? " · sent" : ""}
          </small>
          <span className={styles.spacer} />
          {trakt.needsReconnect ? (
            <a
              className={classNames(styles.button, styles.primary)}
              href="/api/links/trakt/start?returnTo=/notebook%23elsewhere"
            >
              Reconnect
            </a>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={connections.pushStatus === "running"}
              onClick={() => setConfirmPush(true)}
            >
              Send shelf to Trakt
            </button>
          )}
          <button
            type="button"
            className={styles.button}
            onClick={() => void connections.unlinkTrakt()}
          >
            Unlink
          </button>
        </div>
      )}

      {confirmPush && trakt?.connected && (
        <div className={styles.row}>
          <strong>Send shelf to Trakt?</strong>
          <small>
            {connections.pending
              ? `${connections.pending.watched} watched, ${connections.pending.rated} rated, and ${connections.pending.listed} watchlisted items have changed since the last send.`
              : "Only shelf changes since the last send will be included."}
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
            Send
          </button>
          <button type="button" className={styles.button} onClick={() => setConfirmPush(false)}>
            Cancel
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
