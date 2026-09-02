import { useCallback, useEffect, useRef, useState } from "react";

const VISIBLE_RATIO = 0.4;

export function useTourNavigation(count: number, startAt: number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(startAt);

  const stops = useCallback(
    () => [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-stop]") ?? [])],
    [],
  );

  const scrollTo = useCallback(
    (index: number, behavior: ScrollBehavior = "instant") => {
      const target = stops()[Math.min(Math.max(index, 0), count - 1)];

      target?.scrollIntoView({ behavior, block: "start" });
    },
    [count, stops],
  );

  const goTo = useCallback(
    (index: number) => {
      const bounded = Math.min(Math.max(index, 0), count - 1);

      if (!stops()[bounded]) {
        return;
      }

      setActiveIndex(bounded);
      scrollTo(bounded);
    },
    [count, scrollTo, stops],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const index = stops().indexOf(visible.target as HTMLElement);

        if (index >= 0) {
          setActiveIndex(index);
        }
      },
      { threshold: [VISIBLE_RATIO, 0.6, 0.9] },
    );

    for (const stop of stops()) {
      observer.observe(stop);
    }

    return () => observer.disconnect();
  }, [stops]);

  useEffect(() => {
    if (startAt > 0) {
      scrollTo(startAt, "instant");
    }
  }, [scrollTo, startAt]);

  return { rootRef, activeIndex, goTo, scrollTo };
}

const FORWARD = new Set(["ArrowRight", "ArrowDown", "PageDown", " "]);
const BACKWARD = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

export function useTourKeys(
  activeIndex: number,
  goTo: (index: number) => void,
  onPresent: () => void,
) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (FORWARD.has(event.key)) {
        event.preventDefault();
        goTo(activeIndex + 1);
      } else if (BACKWARD.has(event.key)) {
        event.preventDefault();
        goTo(activeIndex - 1);
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        onPresent();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goTo, onPresent]);
}
