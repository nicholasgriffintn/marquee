import { useState } from "react";

import { useFeeds } from "../../hooks/useFeeds";
import { classNames } from "../../lib/class-names";
import { formatDate } from "../../lib/dates";
import { NotebookAside } from "./NotebookSection";

import connectionStyles from "./ConnectionsPanel.module.css";

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
      <div className={connectionStyles.row}>
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
        <span className={connectionStyles.spacer} />
        <button
          type="button"
          className={classNames(connectionStyles.button, connectionStyles.primary)}
          onClick={() => void feeds.cutKey()}
        >
          {feeds.keys.subscribed ? "Cut a new key" : "Cut a key"}
        </button>
        {feeds.keys.subscribed && (
          <button
            type="button"
            className={connectionStyles.button}
            onClick={() => void feeds.dropKey()}
          >
            Take it back
          </button>
        )}
      </div>

      {fresh && (
        <>
          <NotebookAside>
            I keep no copy of these. Put them somewhere now — a new key retires the old one and
            anything subscribed to it goes quiet.
          </NotebookAside>
          <div className={connectionStyles.row}>
            <strong>Calendar</strong>
            <code className={connectionStyles.token}>{webcal(feeds.keys.calendarUrl ?? "")}</code>
            <span className={connectionStyles.spacer} />
            <a className={connectionStyles.button} href={webcal(feeds.keys.calendarUrl ?? "")}>
              Subscribe
            </a>
            <button
              type="button"
              onClick={() => void copy("calendar", feeds.keys.calendarUrl ?? "")}
            >
              {copied === "calendar" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className={connectionStyles.row}>
            <strong>Reader</strong>
            <code className={connectionStyles.token}>{feeds.keys.alertsUrl}</code>
            <span className={connectionStyles.spacer} />
            <button
              type="button"
              className={connectionStyles.button}
              onClick={() => void copy("reader", feeds.keys.alertsUrl ?? "")}
            >
              {copied === "reader" ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {feeds.error && (
        <div className={connectionStyles.row}>
          <p role="alert">{feeds.error}</p>
        </div>
      )}
    </>
  );
}
