import { useSearchParams } from "react-router-dom";

import { TitleCard } from "../components/catalog";
import { ProviderBadge } from "../components/ui";
import type { MediaTitle, Provider } from "../domain/catalog";
import { useBrowse, useGenres, useKeywords } from "../hooks/useBrowse";

export type BrowsePreset = {
  title: string;
  description: string;
  mediaType?: "movie" | "tv";
  sort: "trending" | "popularity" | "score" | "recent";
};

const BROWSE_GENRES = 18;
const BROWSE_KEYWORDS = 28;

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
  const keywords = useKeywords(BROWSE_KEYWORDS);
  const selectedGenres = (params.get("genres") ?? "").split(",").filter(Boolean);
  const selectedKeywords = (params.get("keywords") ?? "").split(",").filter(Boolean);
  const selectedProviders = (params.get("providers") ?? "").split(",").filter(Boolean);
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
    (provider) =>
      provider.status === "feed" &&
      Boolean(provider.watchmodeSourceIds?.length || provider.tmdbProviderIds?.length),
  );
  const shownKeywords = [
    ...selectedKeywords,
    ...keywords.filter((keyword) => !selectedKeywords.includes(keyword)),
  ];
  const browse = useBrowse({
    mediaType: preset.mediaType,
    sort,
    genres: selectedGenres,
    keywords: selectedKeywords,
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
    selectedKeywords.length > 0 ||
    selectedGenres.length > 0 ||
    selectedProviders.length > 0 ||
    Boolean(query) ||
    sort !== preset.sort;

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>{preset.title}</h1>
        </div>
        <p>{preset.description}</p>
      </div>

      <div className="browse-filters">
        <label className="browse-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder={`Search ${preset.title.toLowerCase()}`}
            aria-label={`Search ${preset.title}`}
          />
        </label>

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
                  onClick={() => update({ keywords: toggle(selectedKeywords, keyword).join(",") })}
                >
                  {keyword}
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

        {hasFilters && (
          <button
            type="button"
            className="browse-clear"
            onClick={() => update({ genres: "", keywords: "", providers: "", q: "", sort: "" })}
          >
            Clear filters
          </button>
        )}
      </div>

      {browse.items.length > 0 && (
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
