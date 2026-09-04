import { Link, useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  EpisodeItem,
  EpisodeList,
  ProgrammeHeading,
  ProgrammeMasthead,
  programmeWeek,
} from "../components/programme/Programme";
import { ResultsGrid } from "../components/ResultsGrid";
import { TitleCard } from "../components/TitleCard";
import type { MediaTitle } from "../domain/catalog";
import { editionPath } from "../domain/edition";
import { listingPath } from "../domain/listings";
import { useEdition } from "../hooks/useEdition";
import { ButtonLink, EmptyState, Fact, FactList, Page, StatusNote } from "../ui";

import styles from "./EditionPage.module.css";

export function EditionPage({ onOpen }: { onOpen: (item: MediaTitle) => void }) {
  const { weekOf } = useParams();
  const requested = weekOf === "latest" ? undefined : weekOf;
  const { issue, isLoading, error, status } = useEdition(requested);
  const backIssues = (issue?.issues ?? []).filter((entry) => entry !== issue?.weekOf);

  return (
    <Page>
      <ProgrammeMasthead
        issuedAt={issue?.weekOf ?? requested}
        heading={
          requested ? `The week of ${programmeWeek(requested)}` : "This week on UK streaming"
        }
        note={
          <>
            Printed Monday mornings from what landed on the services, what is coming back, and
            whatever the town has been reading about. <Link to="/sign-in">Get a ticket</Link> and I
            set it from your own shelf instead.
          </>
        }
      />

      {isLoading && <StatusNote busy>Setting the programme…</StatusNote>}

      {!isLoading && !issue && (
        <EmptyState
          heading={status === 404 ? "No programme for that week." : error || "Nothing to print."}
          description="The board outside only goes back as far as the first Monday we printed."
          actions={
            <ButtonLink to="/this-week" variant="primary" size="lg">
              This week’s edition
            </ButtonLink>
          }
        />
      )}

      {issue ? (
        <>
          <FactList min="120px" className={styles.numbers}>
            <Fact term="New on UK streaming" size="lg">
              {issue.numbers.arrivals.toLocaleString()}
            </Fact>
            <Fact term="Series coming back" size="lg">
              {issue.returning.length}
            </Fact>
            <Fact term="Free in the vault" size="lg">
              {issue.numbers.prints.toLocaleString()}
            </Fact>
            <Fact term="In the building" size="lg">
              {issue.numbers.catalogue.toLocaleString()}
            </Fact>
          </FactList>

          {issue.arrivals.map((entry) => (
            <ErrorBoundary key={entry.provider.id} label={`New on ${entry.provider.name}`}>
              <div className={styles.rowHead}>
                <ProgrammeHeading>New on {entry.provider.name}</ProgrammeHeading>
                <Link
                  className={styles.rowLink}
                  to={listingPath(null, { providers: entry.provider.id })}
                >
                  Everything on {entry.provider.name}
                </Link>
              </div>
              <ResultsGrid>
                {entry.items.map((item) => (
                  <TitleCard key={item.id} item={item} onOpen={onOpen} />
                ))}
              </ResultsGrid>
            </ErrorBoundary>
          ))}

          {issue.returning.length > 0 ? (
            <>
              <ProgrammeHeading>Back this week</ProgrammeHeading>
              <EpisodeList>
                {issue.returning.map((entry) => (
                  <EpisodeItem
                    key={`${entry.showName}-${entry.airsAt}`}
                    when={entry.airsAt}
                    name={entry.item?.title ?? entry.showName}
                    detail={
                      entry.season && entry.season > 1
                        ? `Series ${entry.season} begins`
                        : "A new series begins"
                    }
                  />
                ))}
              </EpisodeList>
            </>
          ) : null}

          {issue.trending.length > 0 ? (
            <ErrorBoundary label="What the town is reading about">
              <ProgrammeHeading>What the town is reading about</ProgrammeHeading>
              <ResultsGrid>
                {issue.trending.map((item) => (
                  <TitleCard key={item.id} item={item} onOpen={onOpen} />
                ))}
              </ResultsGrid>
            </ErrorBoundary>
          ) : null}

          {backIssues.length > 0 ? (
            <>
              <ProgrammeHeading>Back issues</ProgrammeHeading>
              <ul className={styles.issues}>
                {backIssues.map((entry) => (
                  <li key={entry}>
                    <Link to={editionPath(entry)}>Week of {programmeWeek(entry)}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
