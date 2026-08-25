import { useState } from "react";

import { useFeeds } from "../../hooks/useFeeds";
import { formatDate } from "../../lib/dates";

function webcal(url: string) {
  return url.replace(/^https?:/u, "webcal:");
}

export function FeedPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const feeds = useFeeds(isSignedIn);
  const [copied, setCopied] = useState("");

  if (!isSignedIn) {
    return null;
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("");
    }
  }

  const fresh = feeds.keys.calendarUrl && feeds.keys.alertsUrl;

  return (
    <>
      <div className="connection-row">
        <strong>Your own diary</strong>
        <small>
          {feeds.keys.subscribed
            ? `Key cut ${formatDate(feeds.keys.createdAt, {})}${
                feeds.keys.lastUsedAt
                  ? `, last read ${formatDate(feeds.keys.lastUsedAt, {})}`
                  : ", never read"
              }.`
            : "Episodes and releases from your shelf, in whatever calendar you already keep."}
        </small>
        <span className="spacer" />
        <button type="button" className="link-button-primary" onClick={() => void feeds.cutKey()}>
          {feeds.keys.subscribed ? "Cut a new key" : "Cut a key"}
        </button>
        {feeds.keys.subscribed && (
          <button type="button" onClick={() => void feeds.dropKey()}>
            Take it back
          </button>
        )}
      </div>

      {fresh && (
        <>
          <p className="notebook-aside">
            I keep no copy of these. Put them somewhere now — a new key retires the old one and
            anything subscribed to it goes quiet.
          </p>
          <div className="connection-row">
            <strong>Calendar</strong>
            <code className="token-value">{webcal(feeds.keys.calendarUrl ?? "")}</code>
            <span className="spacer" />
            <a className="link-button" href={webcal(feeds.keys.calendarUrl ?? "")}>
              Subscribe
            </a>
            <button
              type="button"
              onClick={() => void copy("calendar", feeds.keys.calendarUrl ?? "")}
            >
              {copied === "calendar" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="connection-row">
            <strong>Reader</strong>
            <code className="token-value">{feeds.keys.alertsUrl}</code>
            <span className="spacer" />
            <button type="button" onClick={() => void copy("reader", feeds.keys.alertsUrl ?? "")}>
              {copied === "reader" ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {feeds.error && (
        <div className="connection-row">
          <p role="alert">{feeds.error}</p>
        </div>
      )}
    </>
  );
}
