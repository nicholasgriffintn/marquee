import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  EpisodeItem,
  EpisodeList,
  ProgrammeHeading,
  ProgrammeMasthead,
} from "../components/programme/Programme";
import { ResultsGrid } from "../components/ResultsGrid";
import { TitleArt } from "../components/TitleArt";
import { TitleCard } from "../components/TitleCard";
import { UsherFacts } from "../components/usher/UsherHeroShell";
import type { MediaTitle } from "../domain/catalog";
import { useDigest } from "../hooks/useDigest";
import { useJourneyOpen } from "../hooks/useJourneyOpen";
import { mediaMeta } from "../lib/media";
import { Button, EmptyState, Eyebrow, Fact, FactList, Heading, Page, StatusNote } from "../ui";

import styles from "./DigestPage.module.css";

export function DigestPage({
  isSessionLoading,
  onOpen,
}: {
  isSessionLoading: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const { digest, isLoading } = useDigest(true);
  const openLead = useJourneyOpen(onOpen, {
    journey: digest?.lead?.journey,
    rank: 0,
  });
  const openFresh = useJourneyOpen(onOpen, {
    journey: digest?.freshJourney,
    titleIds: digest?.fresh.map((item) => item.id),
  });
  const openTrending = useJourneyOpen(onOpen, {
    journey: digest?.trendingJourney,
    titleIds: digest?.trending.map((item) => item.id),
  });
  const isSettling = isSessionLoading || isLoading;
  const returning = (digest?.episodes ?? []).filter(
    (episode) => episode.episode === 1 && (episode.season ?? 1) > 1,
  );

  return (
    <Page>
      <ProgrammeMasthead
        issuedAt={digest?.createdAt}
        heading="This week’s programme"
        note={
          <>
            Printed Monday mornings from your own shelf, the schedule, and whatever the town has
            been reading about. Nobody asked me to keep doing this. The{" "}
            <Link to="/this-week/latest">public edition</Link> is on the board outside.
          </>
        }
      />

      {isSettling && <StatusNote busy>Setting the programme…</StatusNote>}

      {!isSettling && !digest && (
        <EmptyState
          heading="Nothing to print yet."
          description="Save a few things to your shelf. The first programme goes out on Monday."
        />
      )}

      {digest?.lead?.item ? (
        <ErrorBoundary label="The pick of the week">
          <article className={styles.lead}>
            <button
              type="button"
              className={styles.leadArt}
              onClick={() => digest.lead?.item && openLead(digest.lead.item)}
            >
              <TitleArt
                url={digest.lead.item.backdropUrl ?? digest.lead.item.posterUrl}
                seed={digest.lead.item.id}
                label={digest.lead.item.title}
                width={780}
                kind={digest.lead.item.backdropUrl ? "backdrop" : "poster"}
                wide
              />
            </button>
            <div className={styles.leadCopy}>
              <Eyebrow tone="accent" tracking="wide" className={styles.leadEyebrow}>
                The pick of the week
              </Eyebrow>
              <Heading level={2} size="heading" className={styles.leadTitle}>
                {digest.lead.item.title}
              </Heading>
              <Eyebrow as="p" weight="regular" className={styles.leadMeta}>
                {mediaMeta(digest.lead.item)}
              </Eyebrow>
              <blockquote className={styles.leadQuote}>{digest.lead.line}</blockquote>
              <UsherFacts facts={digest.lead.facts} className={styles.leadFacts} />
              <Button
                variant="primary"
                size="lg"
                onClick={() => digest.lead?.item && openLead(digest.lead.item)}
              >
                See where to watch
              </Button>
            </div>
          </article>
        </ErrorBoundary>
      ) : null}

      {digest && digest.numbers.shelved > 0 ? (
        <FactList min="120px" className={styles.numbers}>
          <Fact term="Added this week" size="lg">
            {digest.numbers.added}
          </Fact>
          <Fact term="Finished" size="lg">
            {digest.numbers.finished}
          </Fact>
          <Fact term="On your shelf" size="lg">
            {digest.numbers.shelved}
          </Fact>
          <Fact term="In the building" size="lg">
            {digest.numbers.catalogue.toLocaleString()}
          </Fact>
        </FactList>
      ) : null}

      {returning.length > 0 ? (
        <>
          <ProgrammeHeading>Back this week</ProgrammeHeading>
          <EpisodeList>
            {returning.map((episode) => (
              <EpisodeItem
                key={`back-${episode.showName}-${episode.airsAt}`}
                when={episode.airsAt}
                name={episode.showName}
                detail={`Series ${episode.season} begins`}
              />
            ))}
          </EpisodeList>
        </>
      ) : null}

      {digest?.fresh.length ? (
        <ErrorBoundary label="This week's new titles">
          <ProgrammeHeading>New, and close to your taste</ProgrammeHeading>
          <ResultsGrid>
            {digest.fresh.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={openFresh} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      ) : null}

      {digest?.episodes.length ? (
        <>
          <ProgrammeHeading>On the schedule</ProgrammeHeading>
          <EpisodeList>
            {digest.episodes.map((episode) => (
              <EpisodeItem
                key={`${episode.showName}-${episode.airsAt}`}
                when={episode.airsAt}
                name={episode.showName}
                detail={
                  episode.season && episode.episode
                    ? `S${episode.season}E${episode.episode}`
                    : "New episode"
                }
              />
            ))}
          </EpisodeList>
        </>
      ) : null}

      {digest?.trending.length ? (
        <ErrorBoundary label="What the town is reading about">
          <ProgrammeHeading>What the town is reading about</ProgrammeHeading>
          <ResultsGrid>
            {digest.trending.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={openTrending} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      ) : null}
    </Page>
  );
}
