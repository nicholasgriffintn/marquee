import { useState } from "react";

import { BoxOffice } from "../components/screening/BoxOffice";
import { ScreeningProvider } from "../components/screening/ScreeningContext";
import { ScreeningPanel } from "../components/screening/ScreeningPanel";
import type { MediaTitle } from "../domain/catalog";
import { screeningIdFromSearch } from "../domain/screening";
import { useLeaveGuard } from "../hooks/useLeaveGuard";
import { useNowShowing } from "../hooks/useNowShowing";
import { useScreening } from "../hooks/useScreening";
import { Page, PageHeader } from "../ui";

import styles from "./ScreeningPage.module.css";

const NO_TITLES: MediaTitle[] = [];

export function ScreeningPage({ isSignedIn, isAdmin }: { isSignedIn: boolean; isAdmin: boolean }) {
  const screening = useScreening(screeningIdFromSearch(window.location.search));
  const showing = useNowShowing(true);
  const [done, setDone] = useState(false);
  const { id, room, isMember, error } = screening;
  const needsTicket = Boolean(id && room) && !isMember;

  useLeaveGuard(
    isMember && room?.status === "open",
    "The doors are open and you are in the room. Leave the screening?",
  );

  return (
    <ScreeningProvider value={screening}>
      <Page>
        <PageHeader
          heading={
            room ? (
              <>
                {room.definition.title}, <em>decided by the room.</em>
              </>
            ) : (
              <>
                A room, <em>if you have the link.</em>
              </>
            )
          }
          description={
            id
              ? "Get a ticket, then vote when the host opens a poll. Tag the usher with a question if you have one."
              : "Nobody has sent you anywhere. A screening link looks like /screening?screening=…"
          }
        />

        {error && !room && <p className={styles.issue}>{error}</p>}

        {isMember && (
          <div className={styles.room}>
            <ScreeningPanel
              screening={screening}
              follow={false}
              onFollow={() => undefined}
              isPresenting={false}
              isAdmin={isAdmin}
              layout="page"
            />
          </div>
        )}

        {(needsTicket || (isMember && !done)) && id && (
          <BoxOffice
            screening={screening}
            showing={showing.length ? showing : NO_TITLES}
            isSignedIn={isSignedIn}
            onPick={() => undefined}
            onDone={() => setDone(true)}
          />
        )}
      </Page>
    </ScreeningProvider>
  );
}
