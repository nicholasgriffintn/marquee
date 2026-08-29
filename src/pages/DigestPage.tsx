import { ErrorBoundary } from "../components/ErrorBoundary";
import { ResultsGrid } from "../components/ResultsGrid";
import { TitleArt } from "../components/TitleArt";
import { TitleCard } from "../components/TitleCard";
import { UsherFacts } from "../components/usher/UsherHeroShell";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { useDigest } from "../hooks/useDigest";
import { useJourneyOpen } from "../hooks/useJourneyOpen";
import { formatDateTime, parseDate } from "../lib/dates";
import { mediaMeta } from "../lib/media";
import {
  Button,
  EmptyState,
  Eyebrow,
  Fact,
  FactList,
  Heading,
  Page,
  StatusNote,
  Text,
} from "../ui";

import styles from "./DigestPage.module.css";

const FIRST_ISSUE = Date.UTC(1974, 0, 1);

function issuedOn(value: string | undefined) {
  return parseDate(value) ?? new Date();
}

function weekOf(value: string | undefined) {
  return issuedOn(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  });
}

function issueNumber(value: string | undefined) {
  const weeks = Math.floor((issuedOn(value).getTime() - FIRST_ISSUE) / (7 * 86_400_000));

  return weeks.toLocaleString();
}

function formatWhen(value: string) {
  return formatDateTime(value, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DigestPage({
  isSignedIn,
  isSessionLoading,
  onOpen,
}: {
  isSignedIn: boolean;
  isSessionLoading: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const { digest, isLoading } = useDigest(isSignedIn);
  const openLead = useJourneyOpen(onOpen, {
    source: "digest_lead",
    ...(digest?.lead?.decisionId ? { decisionId: digest.lead.decisionId } : {}),
  });
  const openFresh = useJourneyOpen(onOpen, {
    source: "digest_fresh",
    ...(digest?.decisionId ? { decisionId: digest.decisionId } : {}),
  });
  const isSettling = isSessionLoading || (isSignedIn && isLoading);
  const returning = (digest?.episodes ?? []).filter(
    (episode) => episode.episode === 1 && (episode.season ?? 1) > 1,
  );

  return (
    <Page>
      <header className={styles.programme}>
        <div className={styles.masthead}>
          <UsherMark face="idle" crop="head" className={styles.mastheadMark} />
          <div>
            <span className={styles.mastheadName}>The Marquee</span>
            <p className={styles.mastheadWeek}>Week of {weekOf(digest?.createdAt)}</p>
          </div>
          <em className={styles.mastheadIssue}>No. {issueNumber(digest?.createdAt)}</em>
        </div>
        <Heading level={1} size="title" className={styles.title}>
          This week&rsquo;s programme
        </Heading>
        <Text family="serif" italic tone="muted" className={styles.note}>
          Printed Monday mornings from your own shelf, the schedule, and whatever the town has been
          reading about. Nobody asked me to keep doing this.
        </Text>
      </header>

      {isSettling && <StatusNote busy>Setting the programme…</StatusNote>}

      {!isSettling && !isSignedIn && (
        <EmptyState
          heading="Sign in first."
          description="The programme is set from your own shelf, so it needs to know whose it is."
        />
      )}

      {!isSettling && isSignedIn && !digest && (
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
          <Heading level={2} size="label" tone="accent" className={styles.heading}>
            Back this week
          </Heading>
          <ul className={styles.episodes}>
            {returning.map((episode) => (
              <li key={`back-${episode.showName}-${episode.airsAt}`}>
                <time dateTime={episode.airsAt}>{formatWhen(episode.airsAt)}</time>
                <strong>{episode.showName}</strong>
                <small>Series {episode.season} begins</small>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {digest?.fresh.length ? (
        <ErrorBoundary label="This week's new titles">
          <Heading level={2} size="label" tone="accent" className={styles.heading}>
            New, and close to your taste
          </Heading>
          <ResultsGrid>
            {digest.fresh.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={openFresh} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      ) : null}

      {digest?.episodes.length ? (
        <>
          <Heading level={2} size="label" tone="accent" className={styles.heading}>
            On the schedule
          </Heading>
          <ul className={styles.episodes}>
            {digest.episodes.map((episode) => (
              <li key={`${episode.showName}-${episode.airsAt}`}>
                <time dateTime={episode.airsAt}>{formatWhen(episode.airsAt)}</time>
                <strong>{episode.showName}</strong>
                <small>
                  {episode.season && episode.episode
                    ? `S${episode.season}E${episode.episode}`
                    : "New episode"}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {digest?.trending.length ? (
        <ErrorBoundary label="What the town is reading about">
          <Heading level={2} size="label" tone="accent" className={styles.heading}>
            What the town is reading about
          </Heading>
          <ResultsGrid>
            {digest.trending.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      ) : null}
    </Page>
  );
}
