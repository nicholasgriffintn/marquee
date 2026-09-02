import type { LocalShowings } from "../../domain/cinema";
import { useResource } from "../../hooks/useResource";
import { ButtonLink, Callout, Skeleton } from "../../ui";

import styles from "./StreetStop.module.css";

const CINEMA_LIMIT = 6;
const SKELETON_ROWS = [0, 1, 2, 3];

export function StreetStop({ isActive, isSignedIn }: { isActive: boolean; isSignedIn: boolean }) {
  const { data, error, isLoading } = useResource<LocalShowings>("/api/cinema/showing", {
    enabled: isActive && isSignedIn,
  });

  if (!isSignedIn) {
    return (
      <div className={styles.shut}>
        <p className={styles.shutLine}>
          I only go looking for cinemas once somebody has come through the door. No ticket, no
          errand.
        </p>
        <ButtonLink to="/sign-in?returnTo=%2Ftour%23street" variant="primary" size="lg">
          Get a ticket
        </ButtonLink>
      </div>
    );
  }

  const origin = data?.origin ?? null;
  const cinemas = data?.cinemas ?? [];
  const items = data?.items ?? [];

  return (
    <div className={styles.street}>
      <div className={styles.position}>
        <p className={styles.head}>
          <span>Where the edge thinks you are</span>
          <em>Not asked for. Not kept.</em>
        </p>

        {origin ? (
          <>
            <p className={styles.place}>{origin.label ?? "Somewhere with a postcode"}</p>
            <p className={styles.coords}>
              {origin.latitude.toFixed(1)}, {origin.longitude.toFixed(1)} — about a town, never a
              street
            </p>
          </>
        ) : (
          <p className={styles.coords}>
            The edge did not say. That happens, and nothing breaks when it does.
          </p>
        )}
      </div>

      <div className={styles.listings}>
        {error && <Callout>{error}</Callout>}

        {isLoading && cinemas.length === 0 && (
          <div className={styles.rows} aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className={styles.rowSkeleton} />
            ))}
          </div>
        )}

        {cinemas.length > 0 && (
          <>
            <p className={styles.head}>
              <span>{cinemas.length} within reach</span>
              <em>
                {items.length} film{items.length === 1 ? "" : "s"} on between them
              </em>
            </p>
            <ul className={styles.rows}>
              {cinemas.slice(0, CINEMA_LIMIT).map((cinema) => (
                <li key={cinema.id}>
                  <strong>{cinema.name}</strong>
                  <span>{cinema.chain}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {!isLoading && cinemas.length === 0 && !error && (
          <p className={styles.nothing}>
            Nothing near you that publishes anything readable. Two of the chains sit behind a bot
            check a Worker does not get through, and they are absent rather than approximated.
          </p>
        )}
      </div>
    </div>
  );
}
