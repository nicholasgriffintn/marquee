import { useEffect, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { useActiveOption } from "../hooks/useActiveOption";
import { classNames } from "../lib/class-names";
import { ArrowIcon, SearchIcon } from "../ui";
import { TitleArt } from "./TitleArt";

import styles from "./SearchBox.module.css";

export function SearchBox({
  query,
  results,
  isSearching,
  isRefining,
  onQueryChange,
  onOpen,
  onSubmit,
}: {
  query: string;
  results: MediaTitle[];
  isSearching: boolean;
  isRefining: boolean;
  onQueryChange: (value: string) => void;
  onOpen: (item: MediaTitle) => void;
  onSubmit: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const suggestions = results.slice(0, 7);
  const showPanel = isOpen && query.trim().length > 1;
  const { active, setActive, move, reset, optionRefs } = useActiveOption(suggestions.length);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function submit() {
    setIsOpen(false);
    onSubmit();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      const chosen = suggestions[active];

      if (chosen) {
        setIsOpen(false);
        onOpen(chosen);

        return;
      }

      submit();

      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? "down" : "up");
    }
  }

  return (
    <div className={styles.wrap} ref={boxRef}>
      <label className={styles.box}>
        <span aria-hidden="true" className={styles.icon}>
          <SearchIcon />
        </span>
        <input
          className={styles.input}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            reset();
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          aria-label="Search films and television"
          aria-expanded={showPanel}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 && suggestions[active]
              ? `search-option-${suggestions[active].id}`
              : undefined
          }
          role="combobox"
          autoComplete="off"
        />
      </label>

      {showPanel && (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
        <div className={styles.panel} id="search-suggestions" role="listbox">
          {suggestions.map((item, index) => (
            <button
              type="button"
              key={item.id}
              id={`search-option-${item.id}`}
              tabIndex={-1}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
              role="option"
              aria-selected={index === active}
              className={classNames(styles.option, index === active && styles.optionActive)}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                setIsOpen(false);
                onOpen(item);
              }}
            >
              <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
              <span className={styles.optionCopy}>
                <strong>{item.title}</strong>
                <small>
                  {[
                    item.mediaType === "movie" ? "Film" : "TV",
                    item.year,
                    item.pending && "fetching",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
            </button>
          ))}

          <p className={styles.empty} aria-live="polite">
            {suggestions.length > 0
              ? ""
              : isSearching
                ? "Searching…"
                : isRefining
                  ? "Reading a little wider…"
                  : "No matches yet."}
          </p>

          <button type="button" tabIndex={-1} className={styles.all} onClick={submit}>
            See all results for “{query.trim()}” <ArrowIcon />
          </button>
        </div>
      )}
    </div>
  );
}
