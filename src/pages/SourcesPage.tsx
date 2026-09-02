import { Link } from "react-router-dom";

import { ProviderBadge } from "../components/ProviderBadge";
import { SourceStatus } from "../components/sources/SourceStatus";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import { providerStateCopy, type ProviderCategory, type ProviderState } from "../domain/providers";
import { Callout, Heading, Page, PageHeader, Stat, StatGrid, Text } from "../ui";

import styles from "./SourcesPage.module.css";

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
    name: "Wikipedia",
    href: "https://en.wikipedia.org",
    note: "Written descriptions in the revival house",
  },
  {
    name: "Wikidata",
    href: "https://www.wikidata.org",
    note: "Authors' death dates, which close the UK term",
  },
  {
    name: "Wikimedia Commons",
    href: "https://commons.wikimedia.org",
    note: "Revival prints held by the Commons community",
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

const STATES: ProviderState[] = ["live", "stale", "unresolved", "out-of-scope", "failed"];

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
    <Page>
      <PageHeader
        heading={
          <>
            Where all this <em>actually comes from.</em>
          </>
        }
        description="None of it is mine. I did not make a single one of these films and I do not own a frame of them. What I have is a very long list of who does, and the good manners to say so. Below is every service I know about, and exactly how much I can tell you about each."
      />

      <section className={styles.attribution} aria-labelledby="source-attribution-title">
        <Heading level={2} size="label" tone="accent" id="source-attribution-title">
          On the record
        </Heading>
        <Text tone="muted" leading="relaxed" className={styles.attributionLede}>
          Everything above stands on somebody else&apos;s work. Here is whose, and what they are
          owed.
        </Text>
        <div className={styles.credits}>
          {CREDITS.map((credit) => (
            <a key={credit.name} href={credit.href} target="_blank" rel="noreferrer">
              {credit.logo ? (
                <img className={styles.logo} src={credit.logo} alt={credit.name} />
              ) : (
                <strong>{credit.name}</strong>
              )}
              <span>{credit.note}</span>
            </a>
          ))}
          {Array.from({ length: (3 - (CREDITS.length % 3)) % 3 }, (_, index) => (
            <span className={styles.creditBlank} key={index} aria-hidden="true" />
          ))}
        </div>

        <div className={styles.terms}>
          <p>
            Cinema listings are published by the chains themselves — Cineworld, Picturehouse and Vue
            — and are read exactly as they are given. Where a chain publishes days but not times,
            you get days, and I am not going to invent the rest. Cinema locations come from
            OpenStreetMap contributors, licensed under the{" "}
            <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">
              ODbL
            </a>
            .
          </p>
          <p>
            Two licences sit on the same print page in the revival house, and they cover different
            things. Where a description was taken from Wikipedia, the prose is the work of that
            article&rsquo;s editors and stays under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA 4.0
            </a>
            . Every extract names its article, links back to it, and is passed on to you under the
            same licence. The death dates used to work out whether a film is out of UK copyright are
            Wikidata statements, which carry no such obligation — Wikidata publishes them under{" "}
            <a
              href="https://creativecommons.org/publicdomain/zero/1.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC0
            </a>
            . Prints that reached us through Wikimedia Commons carry whatever licence the Commons
            community recorded against the file, and only the ones marked public domain or CC0 are
            taken. That licence is quoted on the print&rsquo;s own page.
          </p>
          <p>
            This product uses the TMDB API but is not endorsed or certified by TMDB. Availability
            changes hourly and nobody tells me when it does, so check the service itself before you
            settle in. If something here is wrong, it is wrong because I was told wrong — say so and
            I will chase it.
          </p>
        </div>
      </section>
      <StatGrid surface="accent" columns={4} className={styles.summary}>
        <Stat value={stats.configured} label="services listed" size="lg" />
        <Stat value={stats.live} label="answering right now" size="lg" />
        <Stat value={stats.stale + stats.failed} label="not answering" size="lg" />
        <Stat value={stats.unresolved + stats.outOfScope} label="no listings to read" size="lg" />
      </StatGrid>

      <section className={styles.tiers} aria-labelledby="tiers-title">
        <Heading level={2} size="label" tone="accent" id="tiers-title" className={styles.rule}>
          What each label means
        </Heading>
        <Text tone="muted" leading="relaxed" className={styles.attributionLede}>
          Every service on this page is wired to the same availability sweep. These labels say what
          that sweep found last time it ran, not what I hope it will find.
        </Text>
        <dl className={styles.tierList}>
          {STATES.map((state) => (
            <div key={state}>
              <SourceStatus as="dt" state={state} className={styles.tierLabel}>
                {providerStateCopy(state)?.label || ""}
              </SourceStatus>
              <dd>{providerStateCopy(state).note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {providerError && <Callout>{providerError}</Callout>}

      <section className={styles.directory} aria-labelledby="directory-title">
        <Heading level={2} size="label" tone="accent" id="directory-title" className={styles.rule}>
          The directory
        </Heading>

        {CATEGORIES.map((category) => {
          const listed = providers.filter((provider) => provider.category === category.name);

          if (listed.length === 0) {
            return null;
          }

          return (
            <div className={styles.shelf} key={category.name}>
              <p className={styles.shelfHead}>
                <span>{category.name}</span>
                <em>{category.aside}</em>
                <small>{listed.length}</small>
              </p>
              <ul className={styles.shelfList}>
                {listed.map((provider) => (
                  <li key={provider.id}>
                    <ProviderBadge provider={provider} compact />
                    <span className={styles.entry}>
                      <span className={styles.entryName}>
                        {provider.homepage ? (
                          <a href={provider.homepage} target="_blank" rel="noreferrer">
                            {provider.name}
                          </a>
                        ) : (
                          <strong>{provider.name}</strong>
                        )}
                        {provider.state !== "live" && provider.reason && (
                          <span className={styles.stale} title={provider.reason}>
                            {provider.state === "unresolved"
                              ? "no match"
                              : provider.state === "out-of-scope"
                                ? "live events"
                                : "not answering"}
                          </span>
                        )}
                      </span>
                      <small>
                        {provider.titles > 0
                          ? `${provider.titles.toLocaleString()} titles · ${provider.sourceLabel}`
                          : provider.sourceLabel}
                      </small>
                    </span>
                    <SourceStatus state={provider.state}>
                      {providerStateCopy(provider.state)?.label || "Unknown"}
                    </SourceStatus>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <Text tone="muted" leading="relaxed" className={styles.redirect}>
        Which of them you actually pay for is your business, not this page&apos;s. I keep that in{" "}
        <Link to="/notebook#services">your notebook</Link>, where you can change it without
        announcing it to anyone.
      </Text>
    </Page>
  );
}
