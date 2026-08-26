import { useState, type MouseEvent } from "react";

import type { ProviderAvailability } from "../domain/catalog";
import {
  STREAMING_LIMIT,
  watchOptions,
  type WatchOption,
} from "../domain/watch";
import { ArrowIcon, ChevronIcon, ProviderBadge } from "./ui";
import type { Exit } from "./usher/ExitDoor";

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
      className={primary ? "watch-button" : "watch-option"}
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
  providers,
  fallbackHref,
  selectedProviderIds,
  hideIfEmpty,
  isRefreshing,
  onLeave,
}: {
  providers: ProviderAvailability[];
  fallbackHref: string | null;
  selectedProviderIds: string[];
  hideIfEmpty?: boolean;
  isRefreshing?: boolean;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const { primary, rest, paid } = watchOptions(
    providers,
    fallbackHref,
    selectedProviderIds,
  );
  const listed = [primary, ...rest, ...paid].filter(Boolean);
  const fromJustWatch = listed.some(
    (option) => option.provider.source !== "AniList",
  );
  const fromAniList = listed.some(
    (option) => option.provider.source === "AniList",
  );

  if (!primary && rest.length === 0 && paid.length === 0) {
    if (isRefreshing) {
      return (
        <div className="watch-actions">
          <span>Watch now</span>
          <p className="availability-empty">
            <i className="availability-spinner" aria-hidden="true" />
            Checking where this is streaming…
          </p>
        </div>
      );
    }

    if (hideIfEmpty) {
      return null;
    }

    return (
      <div className="watch-actions">
        <span>Watch now</span>
        <p className="availability-empty">No streaming options found.</p>
      </div>
    );
  }

  const upfront = rest.slice(0, STREAMING_LIMIT - 1);
  const held = rest.slice(STREAMING_LIMIT - 1);
  const shown = showAll ? rest : upfront;
  const paidOpen = showPaid || !primary;

  return (
    <div className="watch-actions">
      <span>Watch now</span>
      {primary && <WatchLink option={primary} primary onLeave={onLeave} />}

      {shown.length > 0 && (
        <div className={`watch-grid${showAll ? " expanded" : ""}`}>
          {shown.map((option) => (
            <WatchLink
              key={option.provider.id}
              option={option}
              onLeave={onLeave}
            />
          ))}
        </div>
      )}

      {held.length > 0 && !showAll && (
        <button
          type="button"
          className="watch-more"
          onClick={() => setShowAll(true)}
        >
          Show {held.length} more way{held.length === 1 ? "" : "s"} to watch
          <ChevronIcon />
        </button>
      )}

      {paid.length > 0 && (
        <div className="watch-paid">
          {primary && (
            <button
              type="button"
              className="watch-more"
              aria-expanded={paidOpen}
              onClick={() => setShowPaid((open) => !open)}
            >
              Rent or buy from {paid.length} service
              {paid.length === 1 ? "" : "s"}
              <ChevronIcon />
            </button>
          )}
          {paidOpen && (
            <div className="watch-grid expanded">
              {paid.map((option) => (
                <WatchLink
                  key={option.provider.id}
                  option={option}
                  onLeave={onLeave}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <p className="watch-credit">
        {fromJustWatch && (
          <>
            Availability from{" "}
            <a
              href="https://www.justwatch.com"
              target="_blank"
              rel="noreferrer"
            >
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
