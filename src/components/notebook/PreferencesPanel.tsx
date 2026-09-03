import { useEffect, useMemo, useState } from "react";

import type { Cinema } from "../../domain/cinema";
import { isMutedGenre, MUTED_GENRE_LIMIT } from "../../domain/genres";
import { DEFAULT_PREFERRED_LANGUAGE, PREFERRED_LANGUAGES } from "../../domain/languages";
import { useGenres } from "../../hooks/useBrowse";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { jsonMutation, mutateJson, queryJson } from "../../lib/query-client";
import { Button, Chip } from "../../ui";
import { NotebookGroup } from "./NotebookSection";

import styles from "./PreferencesPanel.module.css";

type NotebookPreferences = {
  preferredCinemaId: string | null;
  preferredCinemaName: string | null;
  preferredLocation: string;
  preferredLanguage: string;
  mutedGenres: string[];
  adultConfirmed: boolean;
  offensiveContentApproved: boolean;
};

type CinemaSearchResponse = { cinemas: Cinema[] };

const GENRE_CHOICES = 40;

export function PreferencesPanel({ isSignedIn }: { isSignedIn: boolean }) {
  const [config, setConfig] = useState<NotebookPreferences | null>(null);
  const [location, setLocation] = useState("");
  const [cinemaId, setCinemaId] = useState("");
  const [language, setLanguage] = useState(DEFAULT_PREFERRED_LANGUAGE);
  const [mutedGenres, setMutedGenres] = useState<string[]>([]);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [offensiveContentApproved, setOffensiveContentApproved] = useState(false);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [status, setStatus] = useState("");
  const query = useDebouncedValue(location.trim(), 250);
  const genres = useGenres(GENRE_CHOICES);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let active = true;

    void queryJson<NotebookPreferences>("/api/notebook/preferences")
      .then((response) => {
        if (!active) {
          return response;
        }

        setConfig(response);
        setLocation(response.preferredLocation);
        setCinemaId(response.preferredCinemaId ?? "");
        setLanguage(response.preferredLanguage);
        setMutedGenres(response.mutedGenres);
        setAdultConfirmed(response.adultConfirmed);
        setOffensiveContentApproved(response.offensiveContentApproved);

        return response;
      })
      .catch(() => {
        if (active) {
          setStatus("I could not reach these preferences just now.");
        }
      });

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || query.length < 2) {
      return undefined;
    }

    let active = true;

    void queryJson<CinemaSearchResponse>(
      `/api/notebook/preferences/cinemas?query=${encodeURIComponent(query)}`,
    )
      .then((response) => {
        if (active) {
          setCinemas(response.cinemas);
        }

        return response;
      })
      .catch(() => {
        if (active) {
          setCinemas([]);
        }
      });

    return () => {
      active = false;
    };
  }, [isSignedIn, query]);

  const genreChoices = useMemo(() => {
    const known = new Set(genres.map((genre) => genre.toLowerCase()));

    return [...genres, ...mutedGenres.filter((genre) => !known.has(genre))];
  }, [genres, mutedGenres]);

  const selectedCinema = useMemo(() => {
    const found = cinemas.find((cinema) => cinema.id === cinemaId);

    if (found) {
      return found;
    }

    return config?.preferredCinemaId === cinemaId && config.preferredCinemaName
      ? {
          id: cinemaId,
          name: config.preferredCinemaName,
          address: config.preferredLocation,
          postcode: null,
        }
      : null;
  }, [cinemaId, cinemas, config]);

  if (!isSignedIn) {
    return null;
  }

  function toggleGenre(genre: string) {
    const value = genre.trim().toLowerCase();

    setMutedGenres((current) =>
      current.includes(value)
        ? current.filter((muted) => muted !== value)
        : [...current, value].slice(0, MUTED_GENRE_LIMIT),
    );
  }

  async function save(nextCinemaId = cinemaId, nextLocation = location) {
    if (Boolean(nextCinemaId) !== Boolean(nextLocation.trim())) {
      setStatus("Choose both a location and a cinema, or leave both blank.");

      return;
    }

    setStatus("Writing that down…");

    try {
      const response = await mutateJson<NotebookPreferences>(
        "/api/notebook/preferences",
        jsonMutation("POST", {
          preferredCinemaId: nextCinemaId || null,
          preferredLocation: nextLocation.trim(),
          preferredLanguage: language,
          mutedGenres,
          adultConfirmed,
          offensiveContentApproved: adultConfirmed && offensiveContentApproved,
        }),
      );

      setConfig(response);
      setLocation(response.preferredLocation);
      setCinemaId(response.preferredCinemaId ?? "");
      setMutedGenres(response.mutedGenres);
      setAdultConfirmed(response.adultConfirmed);
      setOffensiveContentApproved(response.offensiveContentApproved);
      setStatus(
        response.preferredCinemaId
          ? "Preferences saved. Cinema notes are now limited to this branch."
          : "Preferences saved. Cinema notes remain switched off.",
      );
    } catch {
      setStatus("Those preferences did not take. Try again.");
    }
  }

  function clearCinema() {
    setLocation("");
    setCinemaId("");
    setCinemas([]);
    void save("", "");
  }

  return (
    <NotebookGroup
      heading="What should reach your seat"
      lede="Recommendations and streaming letters use your preferred audio language. Cinema letters remain off until you choose both a location and one exact cinema branch."
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className={styles.field}>
          <span>Preferred audio language</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {PREFERRED_LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <small>
            Titles without language data count as English. Reported English audio and dubs count
            too.
          </small>
        </label>

        <fieldset className={styles.genreGroup}>
          <legend>Genres you never want</legend>
          <div className={styles.genres}>
            {genreChoices.map((genre) => {
              const muted = isMutedGenre(genre, mutedGenres);

              return (
                <Chip
                  key={genre}
                  selected={muted}
                  pressed={muted}
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                </Chip>
              );
            })}
          </div>
          <small>
            Muted genres are dropped from the featured title, your shelves and anything the Usher
            picks. Up to {MUTED_GENRE_LIMIT}.
          </small>
        </fieldset>

        <fieldset className={styles.genreGroup}>
          <legend>What you are old enough for</legend>
          <ul className={styles.consent}>
            <li>
              <label>
                <input
                  type="checkbox"
                  aria-label="I am 18 or over"
                  checked={adultConfirmed}
                  onChange={(event) => {
                    setAdultConfirmed(event.target.checked);

                    if (!event.target.checked) {
                      setOffensiveContentApproved(false);
                    }
                  }}
                />
                <span>
                  <strong>I am 18 or over</strong>
                  <small>
                    Titles certified for adults only stay off the shelves, out of the Usher&apos;s
                    hands and away from the revival house until you say so.
                  </small>
                </span>
              </label>
            </li>
            <li>
              <label>
                <input
                  type="checkbox"
                  aria-label="Show me prints that carry a content notice"
                  checked={adultConfirmed && offensiveContentApproved}
                  disabled={!adultConfirmed}
                  onChange={(event) => setOffensiveContentApproved(event.target.checked)}
                />
                <span>
                  <strong>Show me prints that carry a content notice</strong>
                  <small>
                    Some of the revival house is racist propaganda, atrocity footage and the like,
                    kept for historical study. It stays behind the curtain unless you ask for it.
                  </small>
                </span>
              </label>
            </li>
          </ul>
        </fieldset>

        <label className={styles.field}>
          <span>Location</span>
          <input
            type="search"
            value={location}
            maxLength={120}
            placeholder="Town, neighbourhood or postcode"
            onChange={(event) => {
              setLocation(event.target.value);
              setCinemaId("");
              setCinemas([]);
            }}
          />
          <small>Start typing to find cinema branches in the directory.</small>
        </label>

        <label className={styles.field}>
          <span>Preferred cinema</span>
          <select
            value={cinemaId}
            disabled={query.length < 2}
            onChange={(event) => setCinemaId(event.target.value)}
          >
            <option value="">Choose a cinema</option>
            {selectedCinema && !cinemas.some((cinema) => cinema.id === selectedCinema.id) && (
              <option value={selectedCinema.id}>{selectedCinema.name}</option>
            )}
            {cinemas.map((cinema) => (
              <option key={cinema.id} value={cinema.id}>
                {[cinema.name, cinema.postcode ?? cinema.address].filter(Boolean).join(" — ")}
              </option>
            ))}
          </select>
          <small>
            {cinemaId
              ? "Only screenings at this branch can trigger a cinema letter."
              : "No cinema letters will be sent until this is configured."}
          </small>
        </label>

        <div className={styles.actions}>
          <Button variant="primary" size="lg" type="submit">
            Save preferences
          </Button>
          {config?.preferredCinemaId && (
            <button type="button" className={styles.clear} onClick={clearCinema}>
              Clear cinema preference
            </button>
          )}
        </div>
      </form>

      {status && (
        <p className={styles.status} aria-live="polite">
          {status}
        </p>
      )}
    </NotebookGroup>
  );
}
