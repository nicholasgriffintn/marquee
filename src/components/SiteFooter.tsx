import { Link } from "react-router-dom";

import { Text } from "../ui";
import { Brand } from "./Brand";

import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Brand />
      <Text tone="inkMuted" size="sm" className={styles.credits}>
        Data by TMDB · Availability by JustWatch · Cinemas by{" "}
        <a
          className={styles.link}
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <Link className={styles.link} to="/sources">
          Services and sources
        </Link>
      </Text>
      <Link className={styles.egg} to="/usher">
        Made for movie night
      </Link>
    </footer>
  );
}
