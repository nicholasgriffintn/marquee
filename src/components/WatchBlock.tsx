import { useState, type MouseEvent } from "react";

import type { ProviderAvailability } from "../domain/catalog";
import { availabilityLine, STREAMING_LIMIT, watchOptions, type WatchOption } from "../domain/watch";
import { classNames } from "../lib/class-names";
import { ArrowIcon, ChevronIcon, Eyebrow, StatusNote } from "../ui";
import { ProviderBadge } from "./ProviderBadge";
import type { Exit } from "./usher/ExitDoor";

import styles from "./WatchBlock.module.css";

function WatchLink({
  option,
  primary,
  onLeave,
}: {
  option: WatchOption;
  primary?: boolean;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={option.href}
      target="_blank"
      rel="noreferrer"
      className={primary ? styles.primary : styles.option}
      onClick={onLeave({
        href: option.href,
        label: option.provider.name,
        kind: "provider",
        providerId: option.provider.id,
        monetization: option.provider.offerTypes.join(","),
      })}
    >
      <ProviderBadge provider={option.provider} compact />
      <span>
        {option.label}
        {primary && <small>{option.provider.offerTypes.join(" · ")}</small>}
      </span>
      <ArrowIcon />
    </a>
  );
}

export function WatchBlock({
  title,
  providers,
  fallbackHref,
  selectedProviderIds,
  hideIfEmpty,
  isRefreshing,
  onLeave,
}: {
  title: string;
  providers: ProviderAvailability[];
  fallbackHref: string | null;
  selectedProviderIds: string[];
  hideIfEmpty?: boolean;
  isRefreshing?: boolean;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const { primary, rest, paid } = watchOptions(providers, fallbackHref, selectedProviderIds);
  const listed = [primary, ...rest, ...paid].filter(Boolean);
  const fromJustWatch = listed.some((option) => option.provider.source !== "AniList");
  const fromAniList = listed.some((option) => option.provider.source === "AniList");
  const summary = availabilityLine(
    title,
    listed.map((option) => option.provider),
  );

  if (!primary && rest.length === 0 && paid.length === 0) {
    if (isRefreshing) {
      return (
        <div className={styles.block}>
          <Eyebrow size="sm" weight="heavy" tone="inkMuted">
            Watch now
          </Eyebrow>
          <StatusNote busy surface="paper">
            Checking where this is streaming…
          </StatusNote>
        </div>
      );
    }

    if (hideIfEmpty) {
      return null;
    }

    return (
      <div className={styles.block}>
        <Eyebrow size="sm" weight="heavy" tone="inkMuted">
          Watch now
        </Eyebrow>
        <StatusNote surface="paper">No streaming options found.</StatusNote>
      </div>
    );
  }

  const upfront = rest.slice(0, STREAMING_LIMIT - 1);
  const held = rest.slice(STREAMING_LIMIT - 1);
  const shown = showAll ? rest : upfront;
  const paidOpen = showPaid || !primary;

  return (
    <div className={styles.block}>
      <Eyebrow size="sm" weight="heavy" tone="inkMuted">
        Watch now
      </Eyebrow>
      {primary && <WatchLink option={primary} primary onLeave={onLeave} />}

      {shown.length > 0 && (
        <div className={classNames(styles.grid, showAll && styles.wide)}>
          {shown.map((option) => (
            <WatchLink key={option.provider.id} option={option} onLeave={onLeave} />
          ))}
        </div>
      )}

      {held.length > 0 && !showAll && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Show {held.length} more way{held.length === 1 ? "" : "s"} to watch
          <ChevronIcon />
        </button>
      )}

      {paid.length > 0 && (
        <div className={styles.paid}>
          {primary && (
            <button
              type="button"
              className={styles.more}
              aria-expanded={paidOpen}
              onClick={() => setShowPaid((open) => !open)}
            >
              Rent or buy from {paid.length} service
              {paid.length === 1 ? "" : "s"}
              <ChevronIcon />
            </button>
          )}
          {paidOpen && (
            <div className={classNames(styles.grid, styles.wide)}>
              {paid.map((option) => (
                <WatchLink key={option.provider.id} option={option} onLeave={onLeave} />
              ))}
            </div>
          )}
        </div>
      )}
      {summary && <p className={styles.summary}>{summary}</p>}
      <p className={styles.credit}>
        {fromJustWatch && (
          <>
            Availability from{" "}
            <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
              JustWatch
            </a>
            .{" "}
          </>
        )}
        {fromAniList ? "Streaming sites from AniList. " : ""}
        It changes without telling me.
      </p>
    </div>
  );
}
