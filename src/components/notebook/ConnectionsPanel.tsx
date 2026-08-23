import { useState } from "react";

import { useLinks } from "../../hooks/useLinks";

export function ConnectionsPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const connections = useLinks(isSignedIn);
  const [tokenLabel, setTokenLabel] = useState("");
  const trakt = connections.links.find((link) => link.provider === "trakt");

  if (!isSignedIn) {
    return null;
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
              {trakt.syncedAt ? ` · synced ${new Date(trakt.syncedAt).toLocaleDateString()}` : ""}
            </small>
            <span className="spacer" />
            <button type="button" onClick={() => void connections.syncTrakt()}>
              Sync now
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
                {token.lastUsedAt
                  ? `used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                  : "never used"}
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
