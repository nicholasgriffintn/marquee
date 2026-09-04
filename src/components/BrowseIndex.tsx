import { Link } from "react-router-dom";

import type { Provider } from "../domain/catalog";
import { listingPath } from "../domain/listings";
import type { ProviderCategory } from "../domain/providers";
import { Heading } from "../ui";

import styles from "./BrowseIndex.module.css";

const STREAMING_CATEGORIES = new Set<ProviderCategory>(["Subscription", "Broadcaster", "Free"]);
const SERVICES = 20;

export function BrowseIndex({ providers, genres }: { providers: Provider[]; genres: string[] }) {
  const services = providers
    .filter(
      (provider) =>
        STREAMING_CATEGORIES.has(provider.category) &&
        provider.capabilities.includes("preference") &&
        provider.titles > 0,
    )
    .toSorted((a, b) => b.titles - a.titles)
    .slice(0, SERVICES);

  if (services.length === 0 && genres.length === 0) {
    return null;
  }

  return (
    <section className={styles.index} aria-label="Browse the listings">
      {services.length > 0 && (
        <div className={styles.group}>
          <Heading level={2} size="label" tone="muted" className={styles.head}>
            Browse by service
          </Heading>
          <ul className={styles.list}>
            {services.map((provider) => (
              <li key={provider.id}>
                <span>{provider.name}</span>
                <Link to={listingPath("movie", { providers: provider.id })}>Films</Link>
                <Link to={listingPath("tv", { providers: provider.id })}>Series</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {genres.length > 0 && (
        <div className={styles.group}>
          <Heading level={2} size="label" tone="muted" className={styles.head}>
            Browse by genre
          </Heading>
          <ul className={styles.list}>
            {genres.map((genre) => (
              <li key={genre}>
                <span>{genre}</span>
                <Link to={listingPath("movie", { genres: genre })}>Films</Link>
                <Link to={listingPath("tv", { genres: genre })}>Series</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
