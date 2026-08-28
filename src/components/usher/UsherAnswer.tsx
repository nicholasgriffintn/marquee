import { useEffect, useState } from "react";

import type { MediaTitle, Provider } from "../../domain/catalog";
import type { UsherQuestion } from "../../domain/usher";
import { useActiveOption } from "../../hooks/useActiveOption";
import { classNames } from "../../lib/class-names";
import { queryJson } from "../../lib/query-client";
import { Button, CheckIcon, Cluster, CloseIcon, VisuallyHidden } from "../../ui";
import { ProviderBadge } from "../ProviderBadge";
import { TitleArt } from "../TitleArt";

import styles from "./UsherAnswer.module.css";

const SEEN_GRID = 18;

const NO_PROVIDERS: Provider[] = [];

export function UsherAnswer({
  question,
  isSaving,
  providers = NO_PROVIDERS,
  size = "md",
  layout = "stack",
  onSubmit,
}: {
  question: UsherQuestion;
  isSaving: boolean;
  providers?: Provider[];
  size?: "md" | "lg";
  layout?: "stack" | "inline";
  onSubmit: (value: unknown) => void;
}) {
  if (question.kind === "single") {
    return (
      <div className={classNames(styles.options, layout === "inline" && styles.optionsWrap)}>
        {(question.options ?? []).map((option) => (
          <button
            key={option.value}
            type="button"
            className={classNames(styles.option, size === "lg" && styles.optionLarge)}
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
        size={size}
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
  size,
  onSubmit,
}: {
  question: UsherQuestion;
  isSaving: boolean;
  providers: Provider[];
  size: "md" | "lg";
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
      <div
        className={isServices ? styles.services : classNames(styles.options, styles.optionsWrap)}
      >
        {(question.options ?? []).map((option) => {
          const isPicked = picked.includes(option.value);
          const provider = byId.get(option.value);

          return (
            <button
              key={option.value}
              type="button"
              className={classNames(
                isServices ? styles.service : styles.option,
                !isServices && size === "lg" && styles.optionLarge,
                isPicked && styles.picked,
              )}
              aria-pressed={isPicked}
              disabled={isSaving}
              onClick={() => toggle(option.value)}
            >
              {isServices && provider && (
                <ProviderBadge provider={provider} className={styles.serviceBadge} />
              )}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <Cluster gap={2}>
        <Button
          variant="primary"
          size="md"
          disabled={isSaving || picked.length < (question.min ?? 0)}
          onClick={() => onSubmit(picked)}
        >
          {picked.length ? `That's ${picked.length}` : "None of those"}
        </Button>
      </Cluster>
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
  const [isOpen, setIsOpen] = useState(true);
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
  const showMatches = matches.length > 0 && isOpen;
  const { active, setActive, move, reset, optionRefs } = useActiveOption(matches.length);

  useEffect(() => {
    let live = true;

    void queryJson<{ people: string[] }>("/api/usher/people")
      .then((response) => {
        if (live) {
          setSuggestions(response.people);
        }

        return response;
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (term.length < 2) {
      return undefined;
    }

    let live = true;
    const timer = window.setTimeout(() => {
      void queryJson<{ people: string[] }>(`/api/usher/people?query=${encodeURIComponent(term)}`)
        .then((response) => {
          if (live) {
            setResults({ term, people: response.people });
          }

          return response;
        })
        .catch(() => undefined);
    }, 180);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  function add(name: string) {
    setPicked((current) =>
      current.includes(name) || current.length >= limit ? current : [...current, name],
    );
    setQuery("");
    reset();
  }

  return (
    <>
      {picked.length > 0 && (
        <div className={styles.chosen}>
          {picked.map((name) => (
            <button
              key={name}
              type="button"
              className={classNames(styles.option, styles.picked, styles.chosenItem)}
              onClick={() => setPicked((current) => current.filter((entry) => entry !== name))}
            >
              {name} <CloseIcon />
              <VisuallyHidden>Remove {name}</VisuallyHidden>
            </button>
          ))}
        </div>
      )}

      <div className={styles.typeahead}>
        <input
          className={classNames(styles.input, styles.typeaheadInput)}
          value={query}
          maxLength={60}
          placeholder={isFull ? `That's ${limit}, the most I'll take` : "Start typing a name…"}
          aria-label={question.line}
          disabled={isSaving || isFull}
          role="combobox"
          aria-expanded={showMatches}
          aria-controls="usher-matches"
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 && matches[active] ? `usher-match-${active}` : undefined
          }
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);

              return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (matches.length === 0) {
                return;
              }

              event.preventDefault();
              setIsOpen(true);
              move(event.key === "ArrowDown" ? "down" : "up");

              return;
            }

            if (event.key === "Enter") {
              const chosen = matches[active] ?? matches[0];

              if (chosen) {
                event.preventDefault();
                add(chosen);
              }
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            reset();
            setIsOpen(true);
          }}
        />
        <small className={styles.count}>
          {picked.length} of {limit}
        </small>

        {showMatches && (
          <div
            className={styles.matches}
            id="usher-matches"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
            role="listbox"
            aria-label="Matching people"
          >
            {matches.map((name, index) => (
              <button
                key={name}
                type="button"
                id={`usher-match-${index}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                className={classNames(
                  styles.option,
                  styles.match,
                  index === active && styles.matchActive,
                )}
                onMouseEnter={() => setActive(index)}
                onClick={() => add(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <p className={styles.note} aria-live="polite">
          {isSearching
            ? "Looking…"
            : noMatches
              ? "Nobody by that name in the catalogue."
              : term.length === 1
                ? "Keep going, two letters at least."
                : ""}
        </p>
      </div>

      {!term && !isFull && offered.length > 0 && (
        <div className={styles.suggests}>
          <span className={styles.suggestsLabel}>Or one of these</span>
          <div className={styles.suggestsRow}>
            {offered.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.suggest}
                disabled={isSaving}
                onClick={() => add(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Cluster gap={2}>
        <Button variant="primary" size="md" disabled={isSaving} onClick={() => onSubmit(picked)}>
          {picked.length ? `That's the lot (${picked.length})` : "Nobody comes to mind"}
        </Button>
      </Cluster>
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
    let active = true;
    const term = query.trim();
    const timer = window.setTimeout(
      () => {
        const search = term ? `&query=${encodeURIComponent(term)}` : "";

        void queryJson<{ items: MediaTitle[] }>(`/api/catalog/browse?sort=popularity${search}`)
          .then((response) => {
            if (active) {
              setItems(response.items.slice(0, SEEN_GRID));
            }

            return response;
          })
          .catch(() => undefined);
      },
      term ? 220 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const pickedIds = new Set(picked.map((item) => item.id));
  const grid = [...picked, ...items.filter((item) => !pickedIds.has(item.id))];

  return (
    <>
      <input
        className={styles.input}
        value={query}
        maxLength={80}
        placeholder="Search for something else…"
        aria-label="Search the catalogue"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.grid}>
        {grid.map((item) => {
          const isPicked = pickedIds.has(item.id);

          return (
            <button
              key={item.id}
              type="button"
              className={classNames(styles.card, isPicked && styles.cardPicked)}
              aria-pressed={isPicked}
              onClick={() =>
                setPicked((current) =>
                  current.some((entry) => entry.id === item.id)
                    ? current.filter((entry) => entry.id !== item.id)
                    : [...current, item],
                )
              }
            >
              <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
              {isPicked ? (
                <span className={styles.cardCheck} aria-hidden="true">
                  <CheckIcon />
                </span>
              ) : null}
              <small>{item.title}</small>
            </button>
          );
        })}
      </div>
      <Cluster gap={2}>
        <Button
          variant="primary"
          size="md"
          disabled={isSaving}
          onClick={() => onSubmit(picked.map((item) => item.id))}
        >
          {picked.length ? `Seen ${picked.length}` : "None of these"}
        </Button>
      </Cluster>
    </>
  );
}
