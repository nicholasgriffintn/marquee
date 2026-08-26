import { useEffect, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { TitleArt } from "./TitleArt";
import { ArrowIcon, SearchIcon } from "./ui";

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
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const suggestions = results.slice(0, 7);
  const showPanel = isOpen && query.trim().length > 1;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;

        return next < -1 ? suggestions.length - 1 : next >= suggestions.length ? -1 : next;
      });
    }
  }

  return (
    <div className="search-box-wrap" ref={boxRef}>
      <label className="search-box">
        <span aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActive(-1);
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
        <div className="search-suggestions" id="search-suggestions" role="listbox">
          {suggestions.map((item, index) => (
            <button
              type="button"
              key={item.id}
              id={`search-option-${item.id}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={index === active}
              className={`search-suggestion${index === active ? " active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                setIsOpen(false);
                onOpen(item);
              }}
            >
              <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
              <span>
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

          {suggestions.length === 0 && (
            <p className="search-suggestion-empty">
              {isSearching
                ? "Searching…"
                : isRefining
                  ? "Reading a little wider…"
                  : "No matches yet."}
            </p>
          )}

          <button type="button" className="search-suggestion-all" onClick={submit}>
            See all results for “{query.trim()}” <ArrowIcon />
          </button>
        </div>
      )}
    </div>
  );
}
