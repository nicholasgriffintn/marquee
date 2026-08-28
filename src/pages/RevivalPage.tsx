import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { Rail, RailEmpty, RailHeading, RailTrack } from "../components/rail/Rail";
import { ProjectionNote } from "../components/revival/ProjectionNote";
import { ReelCard } from "../components/revival/ReelCard";
import { SearchField } from "../components/SearchField";
import { UsherMark } from "../components/usher/UsherMark";
import { revivalPath, workMeta, type RevivalBillSlot, type RevivalShelf } from "../domain/revival";
import { useNearViewport } from "../hooks/useNearViewport";
import {
  useBill,
  useResumeShelf,
  useShelves,
  useVaultSearch,
  useVaultTotal,
} from "../hooks/useRevival";
import {
  ButtonLink,
  Callout,
  EmptyState,
  Eyebrow,
  Heading,
  Page,
  PageHeader,
  Skeleton,
  Text,
} from "../ui";

import styles from "./RevivalPage.module.css";

const BILL_SKELETON_SLOTS = [0, 1, 2, 3];
const SHELF_SKELETON_RAILS = [0, 1];
const SHELF_SKELETON_REELS = [0, 1, 2, 3, 4];

function Shelf({ shelf }: { shelf: RevivalShelf }) {
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref);

  if (shelf.works.length === 0) {
    return null;
  }

  return (
    <Rail bleed={false} railRef={ref}>
      <RailHeading bleed={false} eyebrow={shelf.description} heading={shelf.title} />
      <RailTrack bleed={false}>
        {near
          ? shelf.works.map((work) => <ReelCard key={`${shelf.id}-${work.id}`} work={work} />)
          : shelf.works
              .slice(0, 4)
              .map((work) => <Skeleton key={work.id} className={styles.reel} />)}
      </RailTrack>
    </Rail>
  );
}

function Bill({ bill }: { bill: RevivalBillSlot[] }) {
  if (bill.length === 0) {
    return null;
  }

  return (
    <Rail bleed={false} className={styles.bill}>
      <RailHeading
        bleed={false}
        eyebrow="Programmed for today, and different tomorrow."
        heading="Tonight’s bill"
      />
      <ol className={styles.billList}>
        {bill.map((entry) => (
          <li key={entry.work.id}>
            <Link to={revivalPath(entry.work)}>
              <span className={styles.slot}>{entry.slot}</span>
              <strong>{entry.work.title}</strong>
              <small>{workMeta(entry.work) || entry.note}</small>
            </Link>
          </li>
        ))}
      </ol>
    </Rail>
  );
}

function BillSkeleton() {
  return (
    <section className={styles.bill} aria-hidden="true">
      <div className={styles.skeletonHead}>
        <Skeleton shape="eyebrow" />
        <Skeleton shape="heading" />
      </div>
      <ol className={styles.billList}>
        {BILL_SKELETON_SLOTS.map((slot) => (
          <li key={slot}>
            <span className={styles.billRow}>
              <Skeleton className={styles.slotSkeleton} />
              <Skeleton className={styles.titleSkeleton} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ShelvesSkeleton() {
  return (
    <div aria-hidden="true">
      {SHELF_SKELETON_RAILS.map((rail) => (
        <Rail bleed={false} key={rail}>
          <div className={styles.skeletonHead}>
            <Skeleton shape="eyebrow" />
            <Skeleton shape="heading" />
          </div>
          <RailTrack bleed={false}>
            {SHELF_SKELETON_REELS.map((reel) => (
              <Skeleton className={styles.reel} key={reel} />
            ))}
          </RailTrack>
        </Rail>
      ))}
    </div>
  );
}

export function RevivalPage({ isReady, isSignedIn }: { isReady: boolean; isSignedIn: boolean }) {
  const total = useVaultTotal(isReady);
  const bill = useBill(isReady);
  const shelves = useShelves(isReady);
  const resuming = useResumeShelf(isReady && isSignedIn);
  const [query, setQuery] = useState("");
  const search = useVaultSearch(query);
  const error = bill.error || shelves.error;

  return (
    <Page>
      <PageHeader
        heading="The revival house"
        description={`The small screen at the back. When the building came down, the sign went in a skip and this did not. The prints are out of copyright, the projectionist is somewhere behind that door, and the ticket is nothing. ${total ? `${total.toLocaleString()} in the vault.` : ""}`}
      />

      {error && <Callout>{error}</Callout>}

      <div className={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search the vault"
          label="Search the vault"
          className={styles.searchField}
        />
        {search.isActive && (
          <Eyebrow size="sm" weight="regular">
            {search.isSearching
              ? "Looking…"
              : `${search.works.length.toLocaleString()} of ${total.toLocaleString()} in the vault`}
          </Eyebrow>
        )}
      </div>

      {search.isActive ? (
        <Rail bleed={false} busy={search.isSearching}>
          <RailHeading
            bleed={false}
            eyebrow={
              search.isSearching ? "Going through the shelves." : "What the vault turned up."
            }
            heading="Search results"
          />
          {search.isSearching ? (
            <RailTrack bleed={false}>
              {BILL_SKELETON_SLOTS.map((slot) => (
                <Skeleton key={slot} className={styles.reel} />
              ))}
            </RailTrack>
          ) : search.works.length ? (
            <RailTrack bleed={false}>
              {search.works.map((work) => (
                <ReelCard key={`search-${work.id}`} work={work} />
              ))}
            </RailTrack>
          ) : (
            <RailEmpty>Nothing under that name.</RailEmpty>
          )}
        </Rail>
      ) : (
        <>
          {bill.isLoading ? <BillSkeleton /> : <Bill bill={bill.bill} />}

          {resuming.length > 0 && (
            <ErrorBoundary label="This shelf">
              <Shelf
                shelf={{
                  id: "resume",
                  title: "Where you left off",
                  description: "The lights are still down on these.",
                  works: resuming,
                }}
              />
            </ErrorBoundary>
          )}

          {shelves.isLoading && <ShelvesSkeleton />}

          {shelves.shelves.map((shelf) => (
            <ErrorBoundary key={shelf.id} label="This shelf">
              <Shelf shelf={shelf} />
            </ErrorBoundary>
          ))}

          {!shelves.isLoading && !shelves.shelves.length && (
            <EmptyState
              mark={<UsherMark face="dormant" crop="head" className={styles.mark} />}
              heading="Nothing threaded yet."
              description="The projectionist is still going through the vault. Come back when he has found something worth showing."
              actions={
                <ButtonLink to="/" variant="primary" size="lg">
                  Back to tonight
                </ButtonLink>
              }
            />
          )}

          {shelves.shelves.length > 0 && (
            <>
              <ProjectionNote seed={total} />

              <div className={styles.note}>
                <Heading level={2} size="label" tone="muted" className={styles.noteHead}>
                  On what we are allowed to show you
                </Heading>
                <Text size="sm" leading="relaxed" className={styles.noteLine}>
                  Every print here was published as public domain by the archive holding it. That is
                  their claim, and we pass it on. Whether we thread it up ourselves depends on one
                  thing: UK copyright runs for seventy years after the last of the principal
                  director, the screenwriters and the composer has died. Past that, the print is
                  ours to keep and we serve it from our own vault.
                </Text>
                <Text size="sm" leading="relaxed" className={styles.noteLine}>
                  Not past it, and we do not touch the reel. The play button sends you to the
                  archive that holds it and they show it to you, exactly as they would if you had
                  walked in there yourself. Every print says which of the two it is, and why, on its
                  own page. I would rather tell you where a thing came from than have you wonder.
                </Text>
                <Text size="sm" leading="relaxed">
                  If you think something here is on the wrong shelf, say so. It comes down the same
                  day, and we argue about it afterwards.
                </Text>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
