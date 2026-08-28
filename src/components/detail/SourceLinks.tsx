import type { MouseEvent } from "react";

import type { MediaTitle } from "../../domain/catalog";
import { identifierLinks } from "../../domain/identifiers";
import { ArrowIcon } from "../ui";
import type { Exit } from "../usher/ExitDoor";

type LeaveHandler = (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;

function animeDatabaseLinks(item: MediaTitle): Exit[] {
  const ids = item.externalIds;

  return [
    ids?.anidbId ? { href: `https://anidb.net/anime/${ids.anidbId}`, label: "AniDB" } : null,
    ids?.animeNewsNetworkId
      ? {
          href: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${ids.animeNewsNetworkId}`,
          label: "Anime News Network",
        }
      : null,
    ids?.anilistId ? { href: `https://anilist.co/anime/${ids.anilistId}`, label: "AniList" } : null,
    ids?.kitsuId ? { href: `https://kitsu.app/anime/${ids.kitsuId}`, label: "Kitsu" } : null,
    ids?.aniSearchId
      ? {
          href: `https://www.anisearch.com/anime/${ids.aniSearchId}`,
          label: "AniSearch",
        }
      : null,
    ids?.livechartId
      ? {
          href: `https://www.livechart.me/anime/${ids.livechartId}`,
          label: "LiveChart",
        }
      : null,
    ids?.animePlanetId
      ? {
          href: `https://www.anime-planet.com/anime/${ids.animePlanetId}`,
          label: "Anime-Planet",
        }
      : null,
  ].flatMap((entry) => (entry ? [{ ...entry, kind: "other" as const }] : []));
}

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
      ? [
          {
            href: item.buzz.articleUrl,
            label: "Wikipedia",
            kind: "wikipedia" as const,
          },
        ]
      : []),
    ...(item.imdbUrl ? [{ href: item.imdbUrl, label: "IMDb", kind: "imdb" as const }] : []),
    ...identifierLinks(item.externalIds).map((link) => ({
      href: link.url,
      label: link.label,
      kind: "other" as const,
    })),
    ...(item.anime?.links ?? []).map((link) => ({
      href: link.url,
      label: link.name,
      kind: "other" as const,
    })),
    ...animeDatabaseLinks(item),
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
