import { Link, useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { Rail, RailHeading, RailTrack } from "../components/rail/Rail";
import { ReelCard } from "../components/revival/ReelCard";
import { ReelPlayer } from "../components/revival/ReelPlayer";
import { UsherMark } from "../components/usher/UsherMark";
import {
  CONDITION_LABELS,
  CONDITION_NOTES,
  deliveryNote,
  printMeta,
  revivalPath,
  rightsSummary,
  SOURCE_LABELS,
  ukStanding,
  WIKIPEDIA_TEXT_LICENCE,
  workMeta,
} from "../domain/revival";
import { useScreening } from "../hooks/useRevival";
import {
  ButtonLink,
  Callout,
  ChipTag,
  EmptyState,
  ExternalLinkIcon,
  Fact,
  FactList,
  Page,
  PageHeader,
  Skeleton,
  Text,
} from "../ui";

import styles from "./RevivalScreenPage.module.css";

export function RevivalScreenPage({ isSignedIn }: { isSignedIn: boolean }) {
  const { workId } = useParams();
  const { screening, isLoading, error, isGated } = useScreening(workId);

  if (isLoading) {
    return (
      <Page>
        <Skeleton shape="art" />
      </Page>
    );
  }

  if (!screening && isGated) {
    const returnTo = encodeURIComponent(`/revival/${workId ?? ""}`);

    return (
      <Page>
        <EmptyState
          mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
          heading="Behind the curtain."
          description={error}
          actions={
            <ButtonLink
              to={isSignedIn ? "/notebook#preferences" : `/sign-in?returnTo=${returnTo}`}
              variant="primary"
              size="lg"
            >
              {isSignedIn ? "Open the notebook" : "Come to the box office"}
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  if (!screening) {
    return (
      <Page>
        <EmptyState
          mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
          heading="Nothing showing under that name."
          description={error || "That print is not on our shelves."}
          actions={
            <ButtonLink to="/revival" variant="primary" size="lg">
              Back to the revival house
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  const { work } = screening;

  return (
    <Page>
      <PageHeader heading={work.title} description={workMeta(work) || "Public domain in the UK"} />

      {work.contentNotice && (
        <Callout role="note" className={styles.notice}>
          <strong className={styles.noticeLabel}>Before you start</strong>
          <Text size="sm">{work.contentNotice}</Text>
        </Callout>
      )}

      <ErrorBoundary label="The projector" resetKey={work.id}>
        <ReelPlayer
          key={work.id}
          work={work}
          startAt={screening.positionSeconds}
          canSave={isSignedIn}
        />
      </ErrorBoundary>

      <p className={styles.condition} data-condition={work.condition}>
        <span>{CONDITION_LABELS[work.condition]}</span>
        <em>{CONDITION_NOTES[work.condition]}</em>
      </p>

      {work.synopsis && (
        <div>
          <Text size="lede" leading="relaxed" className={styles.synopsis}>
            {work.synopsis}
          </Text>
          {work.synopsisCredit && (
            <p className={styles.credit}>
              Extract from the Wikipedia article{" "}
              <a href={work.synopsisCredit.url} target="_blank" rel="noreferrer">
                {work.synopsisCredit.article}
              </a>
              , used under{" "}
              <a href={WIKIPEDIA_TEXT_LICENCE.url} target="_blank" rel="noreferrer">
                {WIKIPEDIA_TEXT_LICENCE.name}
              </a>{" "}
              and passed on to you under the same licence.
            </p>
          )}
        </div>
      )}

      {work.tags.length > 0 && (
        <div className={styles.tags}>
          {work.tags
            .filter((tag) => tag.kind !== "language")
            .map((tag) => (
              <ChipTag
                key={`${tag.kind}-${tag.slug}`}
                selected={tag.kind === "genre"}
                className={styles.tag}
              >
                {tag.label}
              </ChipTag>
            ))}
        </div>
      )}

      <FactList min="220px" className={styles.provenance}>
        <Fact term="Rights note">
          {rightsSummary(work)}
          {work.rightsNote ? ` · ${work.rightsNote}` : ""}
        </Fact>
        <Fact term="UK standing">{ukStanding(work)}</Fact>
        <Fact term="Hosted by">{deliveryNote(work)}</Fact>
        <Fact term="Source record">
          <a className={styles.sourceLink} href={work.sourceUrl} target="_blank" rel="noreferrer">
            {SOURCE_LABELS[work.source]} <ExternalLinkIcon />
          </a>
        </Fact>
        {work.titleId && (
          <Fact term="In the catalogue">
            <Link className={styles.sourceLink} to={`/${work.titleId.replace(":", "/")}`}>
              Open the title card
            </Link>
          </Fact>
        )}
      </FactList>

      {screening.prints.length > 0 && (
        <Rail bleed={false} className={styles.prints}>
          <RailHeading
            bleed={false}
            eyebrow={`${screening.prints.length + 1} copies of this survive in the archives.`}
            heading="Other prints"
          />
          <ul className={styles.printList}>
            {screening.prints.map((print) => (
              <li key={print.id}>
                <Link to={revivalPath(print)}>
                  <strong>{print.title}</strong>
                  <small>{printMeta(print)}</small>
                </Link>
              </li>
            ))}
          </ul>
        </Rail>
      )}

      {screening.alsoShowing.length > 0 && (
        <Rail bleed={false}>
          <RailHeading bleed={false} eyebrow="Still running down here." heading="Also showing" />
          <RailTrack bleed={false}>
            {screening.alsoShowing.map((other) => (
              <ReelCard key={other.id} work={other} />
            ))}
          </RailTrack>
        </Rail>
      )}
    </Page>
  );
}
