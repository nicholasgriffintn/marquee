import { Link } from "react-router-dom";

import { Text } from "../ui";
import { Brand } from "./Brand";

import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Brand />
      <div className={styles.creditsWrapper}>
        <Text tone="inkMuted" size="sm" className={styles.credits}>
          © {new Date().getFullYear()} Marquee. All external content remains the property of the rightful owner.
        </Text>
        <Text tone="inkMuted" size="sm" className={styles.credits}>
          Data by <a
            className={styles.link}
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
          >TMDB</a> · Availability by <a
            className={styles.link}
            href="https://justwatch.com"
            target="_blank"
            rel="noreferrer"
          >JustWatch</a> · Content and data from{" "}
          <a
            className={styles.link}
            href="https://wikidata.org"
            target="_blank"
            rel="noreferrer"
          >
            Wikidata
          </a> · Locations{" "}
        <a
          className={styles.link}
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>{" "}
          ·{" "} Find out more on{" "}
        <Link className={styles.link} to="/sources">
          Services and sources
        </Link>
        </Text>
      </div>
      <Link className={styles.egg} to="/usher">
        Made for movie night
      </Link>
    </footer>
  );
}
