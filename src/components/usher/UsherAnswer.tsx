import { useEffect, useState } from "react";

import type { MediaTitle, Provider } from "../../domain/catalog";
import type { UsherQuestion } from "../../domain/usher";
import { requestJson } from "../../lib/api";
import { artwork, artworkSrcSet } from "../../lib/media";
import { ArtPlaceholder } from "../ArtPlaceholder";
import { ProviderBadge } from "../ui";

const SEEN_GRID = 18;

export function UsherAnswer({
  question,
  isSaving,
  providers = [],
  onSubmit,
}: {
  question: UsherQuestion;
  isSaving: boolean;
  providers?: Provider[];
  onSubmit: (value: unknown) => void;
}) {
  if (question.kind === "single") {
    return (
      <div className="usher-options">
        {(question.options ?? []).map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isSaving}
            onClick={() => onSubmit(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (question.kind === "chips") {
    return (
      <ChipAnswer
        question={question}
        isSaving={isSaving}
        providers={providers}
        onSubmit={onSubmit}
      />
    );
  }

  if (question.kind === "people") {
    return <PeopleAnswer question={question} isSaving={isSaving} onSubmit={onSubmit} />;
  }

  return <TitleAnswer isSaving={isSaving} onSubmit={onSubmit} />;
}

function ChipAnswer({
  question,
  isSaving,
  providers,
  onSubmit,
}: {
  question: UsherQuestion;
  isSaving: boolean;
  providers: Provider[];
  onSubmit: (value: unknown) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const limit = question.max ?? 8;
  const isServices = question.id === "providers" && providers.length > 0;
  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  function toggle(value: string) {
    setPicked((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : current.length >= limit
          ? current
          : [...current, value],
    );
  }

  return (
    <>
      <div className={isServices ? "usher-services" : "usher-options usher-options-wrap"}>
        {(question.options ?? []).map((option) => {
          const isPicked = picked.includes(option.value);
          const provider = byId.get(option.value);

          return (
            <button
              key={option.value}
              type="button"
              className={isPicked ? "picked" : ""}
              aria-pressed={isPicked}
              disabled={isSaving}
              onClick={() => toggle(option.value)}
            >
              {isServices && provider && <ProviderBadge provider={provider} />}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className="usher-confirm">
        <button
          type="button"
          className="usher-primary"
          disabled={isSaving || picked.length < (question.min ?? 0)}
          onClick={() => onSubmit(picked)}
        >
          {picked.length ? `That's ${picked.length}` : "None of those"}
        </button>
      </div>
    </>
  );
}

function PeopleAnswer({
  question,
  isSaving,
  onSubmit,
}: {
  question: UsherQuestion;
  isSaving: boolean;
  onSubmit: (value: unknown) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ term: string; people: string[] }>({
    term: "",
    people: [],
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const limit = question.max ?? 5;
  const term = query.trim();
  const isFull = picked.length >= limit;
  const hasResults = results.term === term;
  const matches = term.length >= 2 && hasResults ? results.people : [];
  const isSearching = term.length >= 2 && !hasResults;
  const noMatches = term.length >= 2 && hasResults && results.people.length === 0;
  const offered = suggestions.filter((name) => !picked.includes(name)).slice(0, 6);

  useEffect(() => {
    const controller = new AbortController();

    void requestJson<{ people: string[] }>("/api/usher/people", {
      signal: controller.signal,
    })
      .then((response) => setSuggestions(response.people))
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (term.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestJson<{ people: string[] }>(
        `/api/usher/people?query=${encodeURIComponent(term)}`,
        { signal: controller.signal },
      )
        .then((response) => setResults({ term, people: response.people }))
        .catch(() => undefined);
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function add(name: string) {
    setPicked((current) =>
      current.includes(name) || current.length >= limit ? current : [...current, name],
    );
    setQuery("");
  }

  return (
    <>
      {picked.length > 0 && (
        <div className="usher-picked">
          {picked.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setPicked((current) => current.filter((entry) => entry !== name))}
            >
              {name} <span aria-hidden="true">×</span>
              <span className="visually-hidden">Remove {name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="usher-typeahead">
        <input
          className="usher-input"
          value={query}
          maxLength={60}
          placeholder={isFull ? `That's ${limit}, the most I'll take` : "Start typing a name…"}
          aria-label={question.line}
          disabled={isSaving || isFull}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              add(matches[0]);
            }
          }}
          onChange={(event) => setQuery(event.target.value)}
        />
        <small className="usher-count">
          {picked.length} of {limit}
        </small>

        {matches.length > 0 && (
          <div className="usher-matches">
            {matches.map((name) => (
              <button key={name} type="button" onClick={() => add(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
        {isSearching && <p className="usher-note">Looking…</p>}
        {noMatches && <p className="usher-note">Nobody by that name in the catalogue.</p>}
        {term.length === 1 && <p className="usher-note">Keep going, two letters at least.</p>}
      </div>

      {!term && !isFull && offered.length > 0 && (
        <div className="usher-suggests">
          <span>Or one of these</span>
          <div>
            {offered.map((name) => (
              <button key={name} type="button" disabled={isSaving} onClick={() => add(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="usher-confirm">
        <button
          type="button"
          className="usher-primary"
          disabled={isSaving}
          onClick={() => onSubmit(picked)}
        >
          {picked.length ? `That's the lot (${picked.length})` : "Nobody comes to mind"}
        </button>
      </div>
    </>
  );
}

function TitleAnswer({
  isSaving,
  onSubmit,
}: {
  isSaving: boolean;
  onSubmit: (value: unknown) => void;
}) {
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [picked, setPicked] = useState<MediaTitle[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const term = query.trim();
    const timer = window.setTimeout(
      () => {
        const search = term ? `&query=${encodeURIComponent(term)}` : "";

        void requestJson<{ items: MediaTitle[] }>(`/api/catalog/browse?sort=popularity${search}`, {
          signal: controller.signal,
        })
          .then((response) => setItems(response.items.slice(0, SEEN_GRID)))
          .catch(() => undefined);
      },
      term ? 220 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pickedIds = new Set(picked.map((item) => item.id));
  const grid = [...picked, ...items.filter((item) => !pickedIds.has(item.id))];

  return (
    <>
      <input
        className="usher-input"
        value={query}
        maxLength={80}
        placeholder="Search for something else…"
        aria-label="Search the catalogue"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="usher-grid">
        {grid.map((item) => {
          const isPicked = pickedIds.has(item.id);

          return (
            <button
              key={item.id}
              type="button"
              className={`usher-grid-card${isPicked ? " picked" : ""}`}
              aria-pressed={isPicked}
              onClick={() =>
                setPicked((current) =>
                  current.some((entry) => entry.id === item.id)
                    ? current.filter((entry) => entry.id !== item.id)
                    : [...current, item],
                )
              }
            >
              {item.posterUrl ? (
                <img
                  src={artwork(item.posterUrl, 160) ?? item.posterUrl}
                  srcSet={artworkSrcSet(item.posterUrl, 160)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <ArtPlaceholder seed={item.id} label={item.title} />
              )}
              <small>{item.title}</small>
            </button>
          );
        })}
      </div>
      <div className="usher-confirm">
        <button
          type="button"
          className="usher-primary"
          disabled={isSaving}
          onClick={() => onSubmit(picked.map((item) => item.id))}
        >
          {picked.length ? `Seen ${picked.length}` : "None of these"}
        </button>
      </div>
    </>
  );
}
