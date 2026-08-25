import { useState } from "react";

import { useLinks } from "../../hooks/useLinks";
import { formatDate } from "../../lib/dates";

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
      <div className="connection-row">
        <strong>Trakt</strong>
        {trakt?.available === false ? (
          <small>Not configured on this deployment.</small>
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
              {connections.pushStatus === "timeout"
                ? " · still sending, check back shortly"
                : ""}
            </small>
            <span className="spacer" />
            <button
              type="button"
              disabled={connections.syncStatus === "running"}
              onClick={() => void connections.syncTrakt()}
            >
              Bring it here
            </button>
            <button
              type="button"
              disabled={connections.pushStatus === "running"}
              onClick={() => setConfirmPush(true)}
            >
              Send it there
            </button>
            <button type="button" onClick={() => void connections.unlinkTrakt()}>
              Unlink
            </button>
          </>
        ) : (
          <>
            <small>Import your watch history, ratings and watchlist.</small>
            <span className="spacer" />
            <a
              className="link-button link-button-primary"
              href="/api/links/trakt/start?returnTo=/notebook"
            >
              Connect Trakt
            </a>
          </>
        )}
      </div>

      {confirmPush && trakt?.connected && (
        <div className="connection-row">
          <strong>Send it there</strong>
          <small>
            {connections.pending
              ? `${connections.pending.watched} watched, ${connections.pending.rated} rated and ${connections.pending.listed} waiting would go onto your Trakt account. Only what has changed since the last send.`
              : "Your shelf would go onto your Trakt account."}
          </small>
          <span className="spacer" />
          <button
            type="button"
            className="link-button-primary"
            onClick={() => {
              void connections.pushTrakt();
              setConfirmPush(false);
            }}
          >
            Send it
          </button>
          <button type="button" onClick={() => setConfirmPush(false)}>
            Leave it
          </button>
        </div>
      )}

      <div className="connection-row">
        <strong>API tokens</strong>
        <small>Connect Marquee to an agent over MCP at /mcp.</small>
        <span className="spacer" />
        <input
          className="token-field"
          value={tokenLabel}
          maxLength={60}
          placeholder="Token name, e.g. Claude"
          aria-label="Token name"
          onChange={(event) => setTokenLabel(event.target.value)}
        />
        <button
          type="button"
          className="link-button-primary"
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
        <div className="connection-row">
          <strong>Copy it now</strong>
          <code className="token-value">{connections.freshToken}</code>
          <span className="spacer" />
          <button type="button" onClick={() => void copyToken(connections.freshToken ?? "")}>
            {tokenCopied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={connections.dismissToken}>
            Done
          </button>
        </div>
      )}
      {connections.tokens.length > 0 && (
        <ul className="token-list">
          {connections.tokens.map((token) => (
            <li key={token.id}>
              <strong>{token.label}</strong>
              <small>
                {token.lastUsedAt ? `used ${formatDate(token.lastUsedAt, {})}` : "never used"}
              </small>
              <span className="spacer" />
              <button type="button" onClick={() => void connections.revokeToken(token.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {connections.error && (
        <div className="connection-row">
          <p>{connections.error}</p>
        </div>
      )}
    </>
  );
}
