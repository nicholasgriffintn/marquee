import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";

import type { CatalogSection, MediaTitle } from "../domain/catalog";
import { startJourney } from "../lib/journey";
import { track } from "../lib/telemetry";
import { TitleCard } from "./TitleCard";
import { ChevronIcon } from "./ui";
import { UsherMark } from "./usher/UsherMark";

type RailScroll = {
  overflowing: boolean;
  atStart: boolean;
  atEnd: boolean;
  pages: number;
  page: number;
};

const RAIL_AT_REST: RailScroll = {
  overflowing: false,
  atStart: true,
  atEnd: true,
  pages: 1,
  page: 0,
};

function railPageWidth(element: HTMLElement) {
  const first = element.children[0] as HTMLElement | undefined;

  if (!first) {
    return element.clientWidth;
  }

  const second = element.children[1] as HTMLElement | undefined;
  const pitch = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;

  if (pitch <= 0) {
    return element.clientWidth;
  }

  return Math.max(1, Math.floor(element.clientWidth / pitch)) * pitch;
}

function useRailScroll(trackRef: RefObject<HTMLDivElement | null>) {
  const [scroll, setScroll] = useState(RAIL_AT_REST);

  const measure = useCallback(() => {
    const element = trackRef.current;

    if (!element) {
      return;
    }

    const distance = element.scrollWidth - element.clientWidth;
    const overflowing = distance > 1;
    const pageWidth = railPageWidth(element);
    const pages = overflowing ? Math.ceil(element.scrollWidth / pageWidth) : 1;
    const next: RailScroll = {
      overflowing,
      atStart: element.scrollLeft <= 1,
      atEnd: element.scrollLeft >= distance - 1,
      pages,
      page: Math.min(pages - 1, Math.max(0, Math.round(element.scrollLeft / pageWidth))),
    };

    setScroll((previous) =>
      previous.overflowing === next.overflowing &&
      previous.atStart === next.atStart &&
      previous.atEnd === next.atEnd &&
      previous.pages === next.pages &&
      previous.page === next.page
        ? previous
        : next,
    );
  }, [trackRef]);

  useEffect(measure);

  useEffect(() => {
    const element = trackRef.current;

    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [trackRef, measure]);

  return scroll;
}

export function ContentRail({
  section,
  onOpen,
  ranked,
  byUsher,
  trailing,
  onSeen,
}: {
  section: CatalogSection;
  onOpen: (title: MediaTitle) => void;
  ranked?: boolean;
  byUsher?: boolean;
  trailing?: ReactNode;
  onSeen?: (section: CatalogSection) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const seenRef = useRef("");
  const seenCallback = useRef(onSeen);
  const scroll = useRailScroll(trackRef);

  const turn = useCallback((direction: 1 | -1) => {
    const element = trackRef.current;

    if (!element) {
      return;
    }

    element.scrollBy({
      left: direction * railPageWidth(element),
      behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  useEffect(() => {
    seenCallback.current = onSeen;
  }, [onSeen]);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail || seenRef.current === section.id || section.items.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && seenRef.current !== section.id) {
          seenRef.current = section.id;
          track("rail_impression", { detail: section.id, source: section.angle ?? section.id });
          seenCallback.current?.(section);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(rail);

    return () => observer.disconnect();
  }, [section]);

  return (
    <section className={`content-rail${byUsher ? " rail-by-usher" : ""}`} ref={railRef}>
      <div className="rail-heading">
        <div>
          {byUsher ? (
            <span className="rail-eyebrow">
              <Link to="/usher" className="rail-usher-link" aria-label="Who is the Usher?">
                <UsherMark face="idle" crop="head" className="rail-usher" />
              </Link>
              <b>The Usher</b>
              {section.description && <em>· {section.description}</em>}
            </span>
          ) : section.reason ? (
            <span className="rail-eyebrow rail-because">
              <b>{section.reason}</b>
              {section.description && <em>· {section.description}</em>}
            </span>
          ) : (
            <span>{section.description}</span>
          )}
          <h2>{section.title}</h2>
        </div>
        {scroll.overflowing && (
          <div className="rail-pager">
            <span className="rail-pages" aria-hidden="true">
              {Array.from({ length: scroll.pages }, (_, index) => (
                <i
                  key={`${section.id}-page-${index}`}
                  className={index === scroll.page ? "is-current" : undefined}
                />
              ))}
            </span>
            <button
              type="button"
              aria-label={`Scroll ${section.title} back`}
              disabled={scroll.atStart}
              onClick={() => turn(-1)}
            >
              <ChevronIcon back />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${section.title} forward`}
              disabled={scroll.atEnd}
              onClick={() => turn(1)}
            >
              <ChevronIcon />
            </button>
          </div>
        )}
      </div>
      <div className="rail-track" ref={trackRef}>
        {section.items.length ? (
          section.items.map((item, index) => (
            <TitleCard
              key={`${section.id}-${item.id}`}
              item={item}
              rank={ranked ? index + 1 : undefined}
              onOpen={(title) => {
                startJourney(title.id, section.angle ?? section.id, index);
                track("rail_click", { detail: section.id, titleId: title.id });
                onOpen(title);
              }}
            />
          ))
        ) : (
          <p className="rail-empty">No titles found.</p>
        )}
        {trailing}
      </div>
    </section>
  );
}
