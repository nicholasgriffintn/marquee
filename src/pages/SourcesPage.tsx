import { Link } from "react-router-dom";

import { PageTitle } from "../components/PageTitle";
import { ProviderBadge } from "../components/ui";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import type { ProviderCategory } from "../domain/providers";

const CREDITS: { name: string; href: string; note: string; logo?: string }[] = [
  {
    name: "The Movie Database (TMDB)",
    href: "https://www.themoviedb.org",
    note: "Titles, artwork and metadata",
    logo: "/credits/tmdb.svg",
  },
  {
    name: "JustWatch",
    href: "https://www.justwatch.com",
    note: "Every piece of availability on this site",
  },
  {
    name: "TVmaze",
    href: "https://www.tvmaze.com",
    note: "Air dates and episode schedules",
  },
  {
    name: "MyAnimeList",
    href: "https://myanimelist.net",
    note: "Anime formats, seasons and watch order",
  },
  {
    name: "AniList",
    href: "https://anilist.co",
    note: "Where anime streams, cast and crew",
  },
  {
    name: "Fribb's anime lists",
    href: "https://github.com/Fribb/anime-lists",
    note: "The map between anime databases",
  },
  {
    name: "Wikimedia",
    href: "https://wikimediafoundation.org",
    note: "Pageview trends behind Trending",
  },
  {
    name: "Trakt",
    href: "https://trakt.tv",
    note: "Your imported watch history",
  },
  {
    name: "OpenStreetMap",
    href: "https://www.openstreetmap.org/copyright",
    note: "Where the cinemas actually are",
  },
  {
    name: "Internet Archive",
    href: "https://archive.org",
    note: "Most of the prints in the revival house",
  },
  {
    name: "Library of Congress",
    href: "https://www.loc.gov",
    note: "Revival prints held by the nation",
  },
  {
    name: "Europeana",
    href: "https://www.europeana.eu",
    note: "Revival prints from European archives",
  },
];

const CATEGORIES: { name: ProviderCategory; aside: string }[] = [
  {
    name: "Subscription",
    aside: "The ones with a standing order against your name.",
  },
  {
    name: "Broadcaster",
    aside: "Free at the point of use, if you have paid the licence.",
  },
  { name: "Free", aside: "Free, with the adverts that implies." },
  { name: "Cinema", aside: "Rooms with actual seats in them." },
  { name: "Specialist", aside: "Narrow shelves, well kept." },
  { name: "Sport", aside: "Not my department, but people ask." },
  {
    name: "Rent or buy",
    aside: "A ticket for one evening, or the print itself.",
  },
  {
    name: "Additional coverage",
    aside: "Listed because they turn up in the data.",
  },
];

const STATUS_COPY: Record<string, { label: string; note: string }> = {
  feed: {
    label: "We can see inside",
    note: "Live availability. I know what is on there tonight.",
  },
  link: {
    label: "We can only point",
    note: "No feed to read, so I send you to the door and wish you luck.",
  },
  marker: {
    label: "On the board, nothing behind it",
    note: "Listed so you know it exists. I have nothing to tell you about it yet.",
  },
};

export function SourcesPage({
  providers,
  providerError,
  stats,
}: {
  providers: Provider[];
  providerError: string;
  stats: ProvidersResponse["stats"];
}) {
  return (
    <section className="page-section sources-page">
      <PageTitle
        heading={
          <>
            Where all this <em>actually comes from.</em>
          </>
        }
      >
        <p>
          None of it is mine. I did not make a single one of these films and I
          do not own a frame of them. What I have is a very long list of who
          does, and the good manners to say so. Below is every service I know
          about, and exactly how much I can tell you about each.
        </p>
      </PageTitle>

      <section
        className="source-attribution"
        aria-labelledby="source-attribution-title"
      >
        <h2 id="source-attribution-title">On the record</h2>
        <p className="source-terms-lede">
          Everything above stands on somebody else's work. Here is whose, and
          what they are owed.
        </p>
        <div className="source-credits">
          {CREDITS.map((credit) => (
            <a
              key={credit.name}
              href={credit.href}
              target="_blank"
              rel="noreferrer"
            >
              {credit.logo ? (
                <img
                  className="tmdb-logo"
                  src={credit.logo}
                  alt={credit.name}
                />
              ) : (
                <strong>{credit.name}</strong>
              )}
              <span>{credit.note}</span>
            </a>
          ))}
          {Array.from(
            { length: (3 - (CREDITS.length % 3)) % 3 },
            (_, index) => (
              <span
                className="source-credit-blank"
                key={index}
                aria-hidden="true"
              />
            ),
          )}
        </div>

        <div className="source-terms">
          <p>
            Cinema listings are published by the chains themselves — Cineworld,
            Picturehouse and Vue — and are read exactly as they are given. Where
            a chain publishes days but not times, you get days, and I am not
            going to invent the rest. Cinema locations come from OpenStreetMap
            contributors, licensed under the{" "}
            <a
              href="https://opendatacommons.org/licenses/odbl/"
              target="_blank"
              rel="noreferrer"
            >
              ODbL
            </a>
            .
          </p>
          <p>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB. Availability changes hourly and nobody tells me when it does,
            so check the service itself before you settle in. If something here
            is wrong, it is wrong because I was told wrong — say so and I will
            chase it.
          </p>
        </div>
      </section>
      <div className="source-summary">
        <div>
          <strong>{stats.configured}</strong>
          <span>services listed</span>
        </div>
        <div>
          <strong>{stats.feeds}</strong>
          <span>with availability data</span>
        </div>
        <div>
          <strong>{stats.links}</strong>
          <span>link out only</span>
        </div>
        <div>
          <strong>{stats.markers}</strong>
          <span>listed, no data yet</span>
        </div>
      </div>

      <section className="source-tiers" aria-labelledby="tiers-title">
        <h2 id="tiers-title">Three kinds of door</h2>
        <dl>
          {["feed", "link", "marker"].map((status) => (
            <div key={status}>
              <dt className={`source-status source-status-${status}`}>
                {STATUS_COPY[status]?.label}
              </dt>
              <dd>{STATUS_COPY[status]?.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {providerError && (
        <p className="catalogue-error" role="alert">
          {providerError}
        </p>
      )}

      <section className="source-directory" aria-labelledby="directory-title">
        <h2 id="directory-title">The directory</h2>

        {CATEGORIES.map((category) => {
          const listed = providers.filter(
            (provider) => provider.category === category.name,
          );

          if (listed.length === 0) {
            return null;
          }

          return (
            <div className="source-shelf" key={category.name}>
              <p className="source-shelf-head">
                <span>{category.name}</span>
                <em>{category.aside}</em>
                <small>{listed.length}</small>
              </p>
              <ul>
                {listed.map((provider) => (
                  <li key={provider.id}>
                    <ProviderBadge provider={provider} compact />
                    <span className="source-entry">
                      <span className="source-entry-name">
                        {provider.homepage ? (
                          <a
                            href={provider.homepage}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {provider.name}
                          </a>
                        ) : (
                          <strong>{provider.name}</strong>
                        )}
                        {provider.stale && (
                          <span
                            className="source-stale"
                            title={`${provider.sourceLabel} did not answer on the last sweep. This is the last good listing.`}
                          >
                            not answering
                          </span>
                        )}
                      </span>
                      <small>{provider.sourceLabel}</small>
                    </span>
                    <span
                      className={`source-status source-status-${provider.status}`}
                    >
                      {STATUS_COPY[provider.status]?.label ?? provider.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <p className="source-redirect">
        Which of them you actually pay for is your business, not this page's. I
        keep that in <Link to="/notebook#services">your notebook</Link>, where
        you can change it without announcing it to anyone.
      </p>
    </section>
  );
}
