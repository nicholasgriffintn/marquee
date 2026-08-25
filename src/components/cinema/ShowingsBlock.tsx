import { useState, type MouseEvent } from "react";

import type { CinemaListing, Screening } from "../../domain/cinema";
import { dayLabel, displayAttributes, distanceLabel, screeningTime } from "../../domain/cinema";
import { ArrowIcon } from "../ui";
import type { Exit } from "../usher/ExitDoor";

const ATTRIBUTE_LABELS: Record<string, string> = {
  imax: "IMAX",
  "4dx": "4DX",
  screenx: "ScreenX",
  "70mm": "70mm",
  "35mm": "35mm",
  "3d": "3D",
  "2d": "2D",
  dolby: "Dolby",
  subtitled: "Subtitled",
  "audio-described": "Audio described",
  relaxed: "Relaxed",
};

function attributeLabel(attribute: string) {
  return (
    ATTRIBUTE_LABELS[attribute] ??
    attribute.replaceAll("-", " ").replace(/^\w/u, (letter) => letter.toUpperCase())
  );
}

function groupByDay(screenings: Screening[]) {
  const days = new Map<string, Screening[]>();

  for (const screening of screenings) {
    const existing = days.get(screening.businessDay);

    if (existing) {
      existing.push(screening);
    } else {
      days.set(screening.businessDay, [screening]);
    }
  }

  return [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(0, 4);
}

function ExactDay({
  screenings,
  onLeave,
  cinemaName,
}: {
  screenings: Screening[];
  cinemaName: string;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <>
      {screenings.slice(0, 12).map((screening) => {
        const time = screeningTime(screening);
        const attributes = displayAttributes(screening.attributes).slice(0, 2);

        if (!time) {
          return null;
        }

        return screening.bookingUrl ? (
          <a
            key={screening.id}
            className="showtime"
            href={screening.bookingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onLeave({
              href: screening.bookingUrl,
              label: cinemaName,
              kind: "cinema",
            })}
          >
            <b>{time}</b>
            {attributes.length > 0 && <small>{attributes.map(attributeLabel).join(" · ")}</small>}
          </a>
        ) : (
          <span key={screening.id} className="showtime showtime-flat">
            <b>{time}</b>
          </span>
        );
      })}
    </>
  );
}

function Listing({
  listing,
  onLeave,
}: {
  listing: CinemaListing;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { cinema, screenings } = listing;
  const distance = distanceLabel(cinema.distanceKm);
  const exact = screenings.filter((screening) => screening.precision === "exact");
  const days = groupByDay(exact);
  const coarse = screenings.filter((screening) => screening.precision !== "exact");
  const coarseDays = [
    ...new Set(
      coarse
        .filter((screening) => screening.precision === "day")
        .map((screening) => screening.businessDay),
    ),
  ]
    .sort()
    .slice(0, 5);
  const link = coarse.find((screening) => screening.bookingUrl)?.bookingUrl ?? cinema.bookingUrl;

  return (
    <li className="showings-cinema">
      <div className="showings-cinema-head">
        <span>
          <b>{cinema.name}</b>
          {distance && <em>{distance}</em>}
        </span>
        <small>{cinema.chain}</small>
      </div>

      {days.length > 0 ? (
        <div className="showings-days">
          {days.map(([day, forDay]) => (
            <div className="showings-day" key={day}>
              <span className="showings-day-label">{dayLabel(day)}</span>
              <div className="showings-times">
                <ExactDay screenings={forDay} cinemaName={cinema.name} onLeave={onLeave} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="showings-coarse">
          <p>
            {coarseDays.length > 0
              ? `On ${coarseDays.map((day) => dayLabel(day)).join(", ")}.`
              : "On there now."}{" "}
            They keep their times to themselves.
          </p>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="showings-link"
              onClick={onLeave({ href: link, label: cinema.name, kind: "cinema" })}
            >
              Their listings <ArrowIcon />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function optionLabel(listing: CinemaListing) {
  const distance = distanceLabel(listing.cinema.distanceKm);

  return `${listing.cinema.name}${distance ? ` — ${distance}` : ""} · ${listing.cinema.chain}`;
}

export function ShowingsBlock({
  listings,
  isLoading,
  error,
  placeLabel,
  onLeave,
}: {
  listings: CinemaListing[];
  isLoading: boolean;
  error?: string;
  placeLabel: string | null;
  onLeave: (exit: Exit) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [chosen, setChosen] = useState("");

  if (isLoading) {
    return (
      <div className="showings">
        <span className="showings-eyebrow">On round here</span>
        <p className="showings-empty">Let me check the boards.</p>
      </div>
    );
  }

  if (listings.length === 0) {
    if (error) {
      return (
        <div className="showings">
          <span className="showings-eyebrow">On round here</span>
          <p className="showings-empty">Couldn't check local showings.</p>
        </div>
      );
    }

    return null;
  }

  const listing = listings.find((entry) => entry.cinema.id === chosen) ?? listings[0];

  return (
    <div className="showings">
      <span className="showings-eyebrow">
        On round here{placeLabel ? <em>· {placeLabel}</em> : null}
      </span>
      {listings.length > 1 && (
        <label className="showings-picker">
          <span>Which house</span>
          <select value={listing.cinema.id} onChange={(event) => setChosen(event.target.value)}>
            {listings.map((entry) => (
              <option key={entry.cinema.id} value={entry.cinema.id}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>
          <small>{listings.length.toLocaleString()} nearby, nearest first</small>
        </label>
      )}
      <ul className="showings-list">
        <Listing key={listing.cinema.id} listing={listing} onLeave={onLeave} />
      </ul>
      <p className="showings-foot">
        Other people's houses. I only know what they put on the board. Where they are comes from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
        .
      </p>
    </div>
  );
}
