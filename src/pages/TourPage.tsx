import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

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
import { stopIndex, TOUR_STOPS, type TourStopId } from "../domain/tour";
import { useTourKeys, useTourNavigation } from "../hooks/useTourNavigation";
import { classNames } from "../lib/class-names";

import styles from "./TourPage.module.css";

export function TourPage({
  isSignedIn,
  pad,
  onOpen,
}: {
  isSignedIn: boolean;
  pad: TourPad;
  onOpen: (item: MediaTitle) => void;
}) {
  const location = useLocation();
  const [isPresenting, setIsPresenting] = useState(
    new URLSearchParams(location.search).get("present") === "1",
  );
  const entryIndex = Math.max(stopIndex(location.hash.replace("#", "")), 0);
  const { rootRef, activeIndex, goTo, scrollTo } = useTourNavigation(TOUR_STOPS.length, entryIndex);

  const announcedRef = useRef(entryIndex);

  const anchor = useCallback((index: number) => {
    const { pathname, search } = window.location;

    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}#${TOUR_STOPS[index].id}`,
    );
  }, []);

  const present = useCallback(() => setIsPresenting((current) => !current), []);

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
    <div className={classNames(styles.tour, isPresenting && styles.presenting)} ref={rootRef}>
      <div className={styles.grain} aria-hidden="true" />

      <TourRail
        activeIndex={activeIndex}
        isPresenting={isPresenting}
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
    </div>
  );
}
