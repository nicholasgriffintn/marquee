import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { TitleCard } from "../components/TitleCard";
import { ProviderBadge, SearchField, VerticalChevronIcon } from "../components/ui";
import type { MediaTitle, Provider } from "../domain/catalog";
import { useBrowse, useFilmingPlaces, useGenres, useKeywords } from "../hooks/useBrowse";

export type BrowsePreset = {
  title: string;
  description: string;
  mediaType?: "movie" | "tv";
  sort: "trending" | "popularity" | "score" | "recent";
};

const BROWSE_GENRES = 18;
const BROWSE_KEYWORDS = 28;
const BROWSE_PLACES = 24;

const KINDS: { value: "" | "movie" | "tv"; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "Series" },
];

const SORTS: { value: BrowsePreset["sort"]; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "popularity", label: "Popular" },
  { value: "score", label: "Highest rated" },
  { value: "recent", label: "Newest" },
];

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function BrowsePage({
  preset,
  providers,
  onOpen,
}: {
  preset: BrowsePreset;
  providers: Provider[];
  onOpen: (item: MediaTitle) => void;
}) {
  const [params, setParams] = useSearchParams();
  const genres = useGenres(BROWSE_GENRES);
  const typeParam = params.get("type");
  const mediaType: "" | "movie" | "tv" =
    typeParam === "movie" || typeParam === "tv" ? typeParam : (preset.mediaType ?? "");
  const keywords = useKeywords(BROWSE_KEYWORDS);
  const places = useFilmingPlaces(BROWSE_PLACES);
  const selectedGenres = (params.get("genres") ?? "").split(",").filter(Boolean);
  const selectedKeywords = (params.get("keywords") ?? "").split(",").filter(Boolean);
  const selectedProviders = (params.get("providers") ?? "").split(",").filter(Boolean);
  const selectedPlaces = (params.get("places") ?? "").split(",").filter(Boolean);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    selectedGenres.length > 0 ||
      selectedKeywords.length > 0 ||
      selectedProviders.length > 0 ||
      selectedPlaces.length > 0,
  );
  const query = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sort: BrowsePreset["sort"] =
    sortParam === "score" ||
    sortParam === "recent" ||
    sortParam === "popularity" ||
    sortParam === "trending"
      ? sortParam
      : preset.sort;
  const filterable = providers.filter(
    (provider) => provider.status === "feed" && Boolean(provider.tmdbProviderIds?.length),
  );
  const shownKeywords = [
    ...selectedKeywords,
    ...keywords.filter((keyword) => !selectedKeywords.includes(keyword)),
  ];
  const shownPlaces = [
    ...selectedPlaces,
    ...places.filter((place) => !selectedPlaces.includes(place)),
  ];
  const browse = useBrowse({
    mediaType: mediaType || undefined,
    sort,
    genres: selectedGenres,
    keywords: selectedKeywords,
    places: selectedPlaces,
    providerIds: selectedProviders,
    query,
  });

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params);

    for (const [name, value] of Object.entries(next)) {
      if (value) {
        merged.set(name, value);
      } else {
        merged.delete(name);
      }
    }

    setParams(merged, { replace: true });
  }

  const hasFilters =
    selectedPlaces.length > 0 ||
    selectedKeywords.length > 0 ||
    mediaType !== (preset.mediaType ?? "") ||
    selectedGenres.length > 0 ||
    selectedProviders.length > 0 ||
    Boolean(query) ||
    sort !== preset.sort;

  return (
    <section className="page-section">
      <PageTitle heading={preset.title}>
        <p>{preset.description}</p>
      </PageTitle>

      <div className="browse-filters">
        <SearchField
          value={query}
          onChange={(value) => update({ q: value })}
          placeholder={`Search ${preset.title.toLowerCase()}`}
          label={`Search ${preset.title}`}
        />

        <div className="browse-facet">
          <span>Kind</span>
          <div className="browse-chips">
            {KINDS.map((option) => (
              <button
                type="button"
                key={option.value || "all"}
                className={mediaType === option.value ? "selected" : ""}
                aria-pressed={mediaType === option.value}
                onClick={() => update({ type: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="browse-facet">
          <span>Sort</span>
          <div className="browse-chips">
            {SORTS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={sort === option.value ? "selected" : ""}
                aria-pressed={sort === option.value}
                onClick={() => update({ sort: option.value === preset.sort ? "" : option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="browse-more-filters browse-more-filters-open"
          aria-expanded={showAdvancedFilters}
          onClick={() => setShowAdvancedFilters(true)}
        >
          Show more filters <VerticalChevronIcon />
        </button>

        <div className={`browse-advanced${showAdvancedFilters ? " expanded" : ""}`}>
          <div className="browse-facet">
            <span>Genre</span>
            <div className="browse-chips">
              {genres.map((genre) => (
                <button
                  type="button"
                  key={genre}
                  className={selectedGenres.includes(genre) ? "selected" : ""}
                  aria-pressed={selectedGenres.includes(genre)}
                  onClick={() => update({ genres: toggle(selectedGenres, genre).join(",") })}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {shownKeywords.length > 0 && (
            <div className="browse-facet">
              <span>Tag</span>
              <div className="browse-chips">
                {shownKeywords.map((keyword) => (
                  <button
                    type="button"
                    key={keyword}
                    className={selectedKeywords.includes(keyword) ? "selected" : ""}
                    aria-pressed={selectedKeywords.includes(keyword)}
                    onClick={() =>
                      update({ keywords: toggle(selectedKeywords, keyword).join(",") })
                    }
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          )}

          {shownPlaces.length > 0 && (
            <div className="browse-facet">
              <span>Shot in</span>
              <div className="browse-chips">
                {shownPlaces.map((place) => (
                  <button
                    type="button"
                    key={place}
                    className={selectedPlaces.includes(place) ? "selected" : ""}
                    aria-pressed={selectedPlaces.includes(place)}
                    onClick={() => update({ places: toggle(selectedPlaces, place).join(",") })}
                  >
                    {place}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filterable.length > 0 && (
            <div className="browse-facet">
              <span>Source</span>
              <div className="browse-chips browse-chips-sources">
                {filterable.slice(0, 24).map((provider) => (
                  <button
                    type="button"
                    key={provider.id}
                    className={selectedProviders.includes(provider.id) ? "selected" : ""}
                    aria-pressed={selectedProviders.includes(provider.id)}
                    title={provider.name}
                    onClick={() =>
                      update({ providers: toggle(selectedProviders, provider.id).join(",") })
                    }
                  >
                    <ProviderBadge provider={provider} compact />
                    <small>{provider.name}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="browse-more-filters browse-more-filters-close"
            aria-expanded={showAdvancedFilters}
            onClick={() => setShowAdvancedFilters(false)}
          >
            Show less filters <VerticalChevronIcon up />
          </button>
        </div>

        {hasFilters && (
          <button
            type="button"
            className="browse-clear"
            onClick={() =>
              update({ genres: "", keywords: "", places: "", providers: "", q: "", sort: "" })
            }
          >
            Clear filters
          </button>
        )}
      </div>

      {browse.items.length > 0 && (
        <ErrorBoundary label="These listings">
          <div className="results-grid">
            {browse.items.map((item, index) => (
              <TitleCard
                key={item.id}
                item={item}
                onOpen={onOpen}
                rank={sort === "popularity" || sort === "trending" ? index + 1 : undefined}
              />
            ))}
          </div>
        </ErrorBoundary>
      )}

      {browse.isLoading && browse.items.length === 0 && (
        <div className="results-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
            <div className="rail-card" key={card}>
              <span className="skeleton skeleton-art" />
              <span className="skeleton skeleton-meta" />
            </div>
          ))}
        </div>
      )}

      {!browse.isLoading && browse.items.length === 0 && (
        <div className="search-empty">
          <h2>{browse.error || "Nothing matches those filters."}</h2>
          <p>Try removing a genre or a source.</p>
        </div>
      )}

      {browse.hasMore && (
        <div className="browse-more">
          <button type="button" onClick={browse.loadMore} disabled={browse.isLoading}>
            {browse.isLoading ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </section>
  );
}
