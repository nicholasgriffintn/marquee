import { Link } from "react-router-dom";

import type { ProvidersResponse } from "../domain/catalog";

const TMDB_LOGO =
  "https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg";

export function SourcesPage({ stats }: { stats: ProvidersResponse["stats"] }) {
  return (
    <section className="page-section sources-page">
      <div className="page-title-row">
        <div>
          <h1>
            Where all this <em>actually comes from.</em>
          </h1>
        </div>

        <p>
          None of it is mine. JustWatch provides availability and deep links, with TMDB covering the
          service directory and Watchmode filling the gaps on saved titles. Services without a feed
          still link out, so you can see what is missing rather than wonder.
        </p>
      </div>

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

      <p className="source-redirect">
        Choosing which of them you pay for is a private matter, so I keep it in{" "}
        <Link to="/notebook#services">your notebook</Link>.
      </p>

      <section className="source-attribution" aria-labelledby="source-attribution-title">
        <h2 id="source-attribution-title">Where this comes from</h2>
        <div className="source-credits">
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            <img className="tmdb-logo" src={TMDB_LOGO} alt="The Movie Database (TMDB)" />
            <span>Titles, artwork and metadata</span>
          </a>
          <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
            <strong>JustWatch</strong>
            <span>Availability and deep links</span>
          </a>
          <a href="https://www.watchmode.com" target="_blank" rel="noreferrer">
            <strong>Watchmode</strong>
            <span>Service directory and gap filling</span>
          </a>
          <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
            <strong>TVmaze</strong>
            <span>Air dates and episode schedules</span>
          </a>
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            <strong>AniList</strong>
            <span>Anime tags and episode schedules</span>
          </a>
          <a href="https://wikimediafoundation.org" target="_blank" rel="noreferrer">
            <strong>Wikimedia</strong>
            <span>Pageview trends behind Trending</span>
          </a>
          <a href="https://trakt.tv" target="_blank" rel="noreferrer">
            <strong>Trakt</strong>
            <span>Your imported watch history</span>
          </a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            <strong>OpenStreetMap</strong>
            <span>Where the cinemas actually are</span>
          </a>
        </div>
        <p>
          Cinema listings are published by the chains themselves — Cineworld, Picturehouse and Vue —
          and are read as they are given. Where a chain publishes days but not times, you get days.
          Cinema locations come from OpenStreetMap contributors, licensed under the{" "}
          <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">
            ODbL
          </a>
          .
        </p>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Listings change,
          so check the service itself before you settle in.
        </p>
      </section>
    </section>
  );
}
