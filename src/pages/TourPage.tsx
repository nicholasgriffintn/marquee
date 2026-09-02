import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { BoxOffice } from "../components/screening/BoxOffice";
import { ScreeningProvider } from "../components/screening/ScreeningContext";
import { ScreeningPanel } from "../components/screening/ScreeningPanel";
import { BoothStop } from "../components/tour/BoothStop";
import { CorridorStop } from "../components/tour/CorridorStop";
import { DoorStop } from "../components/tour/DoorStop";
import { ExitStop } from "../components/tour/ExitStop";
import { FoyerStop } from "../components/tour/FoyerStop";
import { PadStop, type TourPad } from "../components/tour/PadStop";
import { ScreenStop } from "../components/tour/ScreenStop";
import { StepStop } from "../components/tour/StepStop";
import { StreetStop } from "../components/tour/StreetStop";
import { TourRail } from "../components/tour/TourRail";
import { TourStop } from "../components/tour/TourStop";
import type { MediaTitle } from "../domain/catalog";
import { findTool, SCREENING_PARAM, screeningIdFromSearch } from "../domain/screening";
import { stopIndex, TOUR_STOPS, type TourStopId } from "../domain/tour";
import { useLeaveGuard } from "../hooks/useLeaveGuard";
import { useNowShowing } from "../hooks/useNowShowing";
import { useScreening } from "../hooks/useScreening";
import { useTourKeys, useTourNavigation } from "../hooks/useTourNavigation";
import { classNames } from "../lib/class-names";

import styles from "./TourPage.module.css";

const CURSOR_INTERVAL_MS = 50;
const LEAVE_MESSAGE = "The doors are open and you are in the room. Leave the screening?";

type CheckInPhase = "idle" | "checking" | "done";

export function TourPage({
  isSignedIn,
  isAdmin,
  pad,
  onOpen,
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  pad: TourPad;
  onOpen: (item: MediaTitle) => void;
}) {
  const location = useLocation();
  const [localPresenting, setLocalPresenting] = useState(
    new URLSearchParams(location.search).get("present") === "1",
  );
  const entryIndex = Math.max(stopIndex(location.hash.replace("#", "")), 0);
  const { rootRef, activeIndex, goTo, scrollTo } = useTourNavigation(TOUR_STOPS.length, entryIndex);
  const screening = useScreening(screeningIdFromSearch(window.location.search));
  const showing = useNowShowing(true);
  const [checkIn, setCheckIn] = useState<CheckInPhase>("idle");
  const [follow, setFollow] = useState(true);

  const { id: roomId, room, isMember, isHost, connection, actions } = screening;
  const hostStage = room?.hostStage ?? null;
  const roomLights = room?.lightsDown ?? null;

  const isPresenting = isMember && !isHost && roomLights !== null ? roomLights : localPresenting;

  const announcedRef = useRef(entryIndex);
  const activeRef = useRef(activeIndex);

  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  const anchor = useCallback((index: number) => {
    const { pathname, search } = window.location;

    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}#${TOUR_STOPS[index].id}`,
    );
  }, []);

  const present = useCallback(() => setLocalPresenting((current) => !current), []);

  const modeRef = useRef(isPresenting);

  useEffect(() => {
    if (modeRef.current === isPresenting) {
      return;
    }

    modeRef.current = isPresenting;
    scrollTo(announcedRef.current, "instant");
  }, [isPresenting, scrollTo]);

  useTourKeys(activeIndex, goTo, present);

  useEffect(() => {
    if (activeIndex === announcedRef.current) {
      return;
    }

    announcedRef.current = activeIndex;
    anchor(activeIndex);
  }, [activeIndex, anchor]);

  useLeaveGuard(isMember && room?.status === "open", LEAVE_MESSAGE);

  useEffect(() => {
    if (isMember && isHost && connection === "live") {
      actions.setLights(isPresenting);
    }
  }, [actions, connection, isHost, isMember, isPresenting]);
  const tracksCursors = Boolean(room && findTool(room.definition, "cursors"));

  const isCheckingIn =
    checkIn === "checking" || (checkIn === "idle" && Boolean(roomId && room) && !isMember);

  useEffect(() => {
    if (isMember && connection === "live") {
      actions.setStage(TOUR_STOPS[activeIndex].id);
    }
  }, [actions, activeIndex, connection, isMember]);

  useEffect(() => {
    if (!isMember || isHost || !follow || !hostStage) {
      return;
    }

    const index = stopIndex(hostStage);

    if (index >= 0 && index !== activeRef.current) {
      goTo(index);
    }
  }, [follow, goTo, hostStage, isHost, isMember]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || !isMember || !tracksCursors) {
      return undefined;
    }

    let last = 0;

    function onMove(event: PointerEvent) {
      const now = performance.now();

      if (now - last < CURSOR_INTERVAL_MS || !(event.target instanceof Element)) {
        return;
      }

      const section = event.target.closest<HTMLElement>("[data-stop]");

      if (!section?.dataset.stop) {
        return;
      }

      last = now;

      const rect = section.getBoundingClientRect();

      actions.moveCursor(
        section.dataset.stop,
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
    }

    root.addEventListener("pointermove", onMove);

    return () => root.removeEventListener("pointermove", onMove);
  }, [actions, isMember, rootRef, tracksCursors]);

  async function openDoors() {
    const opened = await actions.open("tour");
    const url = new URL(window.location.href);

    url.searchParams.set(SCREENING_PARAM, opened.id);
    url.hash = opened.definition.hash;
    window.history.replaceState(window.history.state, "", url);
    setCheckIn("checking");
  }

  function stage(id: TourStopId, index: number) {
    const isActive = index === activeIndex;
    const isNear = Math.abs(index - activeIndex) <= 1;

    switch (id) {
      case "step":
        return <StepStop isActive={isActive} onBegin={() => goTo(index + 1)} />;
      case "foyer":
        return <FoyerStop isActive={isNear} onOpen={onOpen} />;
      case "pad":
        return <PadStop isActive={isNear} isSignedIn={isSignedIn} pad={pad} onOpen={onOpen} />;
      case "corridor":
        return <CorridorStop isActive={isNear} onOpen={onOpen} />;
      case "screen":
        return <ScreenStop isActive={isNear} isSignedIn={isSignedIn} />;
      case "street":
        return <StreetStop isActive={isNear} isSignedIn={isSignedIn} />;
      case "door":
        return <DoorStop />;
      case "booth":
        return <BoothStop isActive={isNear} />;
      case "exit":
        return <ExitStop isSignedIn={isSignedIn} />;
      default:
        return null;
    }
  }

  return (
    <ScreeningProvider value={screening}>
      <div
        className={classNames(
          styles.tour,
          isPresenting && styles.presenting,
          isMember && styles.withRoom,
        )}
        ref={rootRef}
      >
        <div className={styles.grain} aria-hidden="true" />

        <TourRail
          activeIndex={activeIndex}
          isPresenting={isPresenting}
          canOpenDoors={isAdmin && !roomId}
          onOpenDoors={() => void openDoors()}
          onGoTo={goTo}
          onPresent={present}
        />

        {TOUR_STOPS.map((stop, index) => (
          <TourStop
            key={stop.id}
            stop={stop}
            index={index}
            total={TOUR_STOPS.length}
            isActive={index === activeIndex}
          >
            {stage(stop.id, index)}
          </TourStop>
        ))}

        {isMember && (
          <ScreeningPanel
            screening={screening}
            follow={follow}
            onFollow={setFollow}
            isPresenting={isPresenting}
            isAdmin={isAdmin}
          />
        )}

        {isCheckingIn && (
          <BoxOffice
            screening={screening}
            showing={showing}
            isSignedIn={isSignedIn}
            onPick={() => setCheckIn("checking")}
            onDone={() => setCheckIn("done")}
          />
        )}
      </div>
    </ScreeningProvider>
  );
}
