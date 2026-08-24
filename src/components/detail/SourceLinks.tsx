import type { MouseEvent } from "react";

import type { MediaTitle } from "../../domain/catalog";
import { ArrowIcon } from "../ui";
import type { Exit } from "../usher/ExitDoor";

type LeaveHandler = (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;

export function SourceLinks({ item, onLeave }: { item: MediaTitle; onLeave: LeaveHandler }) {
  const exits: Exit[] = [
    ...(item.trailerKey
      ? [
          {
            href: `https://www.youtube.com/watch?v=${item.trailerKey}`,
            label: "Trailer",
            kind: "trailer" as const,
          },
        ]
      : []),
    { href: item.tmdbUrl, label: "TMDB", kind: "tmdb" },
    ...(item.buzz
      ? [{ href: item.buzz.articleUrl, label: "Wikipedia", kind: "wikipedia" as const }]
      : []),
    ...(item.imdbUrl ? [{ href: item.imdbUrl, label: "IMDb", kind: "imdb" as const }] : []),
    ...(item.anime?.links ?? []).map((link) => ({
      href: link.url,
      label: link.name,
      kind: "other" as const,
    })),
  ];

  const seen = new Set<string>();
  const shown = exits.filter((exit) => {
    const key = exit.label.toLowerCase();

    return seen.has(key) ? false : Boolean(seen.add(key));
  });

  return (
    <div className="resource-links">
      <span>SOURCE LINKS</span>
      {shown.map((exit) => (
        <a
          key={exit.label}
          href={exit.href}
          target="_blank"
          rel="noreferrer"
          onClick={onLeave(exit)}
        >
          {exit.label} <ArrowIcon />
        </a>
      ))}
    </div>
  );
}
