import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { AdvancedFacets, ClearFilters, Facet, FilterBar } from "../components/filters/FilterBar";
import { ProviderBadge } from "../components/ProviderBadge";
import { LoadMore, ResultsGrid, ResultsSkeleton } from "../components/ResultsGrid";
import { SearchField } from "../components/SearchField";
import { TitleCard } from "../components/TitleCard";
import type { MediaTitle, Provider } from "../domain/catalog";
import { useBrowse, useFilmingPlaces, useGenres, useKeywords } from "../hooks/useBrowse";
import { Chip, EmptyState, Page, PageHeader } from "../ui";

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
    <Page>
      <PageHeader heading={preset.title} description={preset.description} />

      <FilterBar>
        <SearchField
          value={query}
          onChange={(value) => update({ q: value })}
          placeholder={`Search ${preset.title.toLowerCase()}`}
          label={`Search ${preset.title}`}
        />

        <Facet label="Kind">
          {KINDS.map((option) => (
            <Chip
              key={option.value || "all"}
              selected={mediaType === option.value}
              pressed={mediaType === option.value}
              onClick={() => update({ type: option.value })}
            >
              {option.label}
            </Chip>
          ))}
        </Facet>

        <Facet label="Sort">
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              selected={sort === option.value}
              pressed={sort === option.value}
              onClick={() =>
                update({
                  sort: option.value === preset.sort ? "" : option.value,
                })
              }
            >
              {option.label}
            </Chip>
          ))}
        </Facet>

        <AdvancedFacets
          defaultOpen={
            selectedGenres.length > 0 ||
            selectedKeywords.length > 0 ||
            selectedProviders.length > 0 ||
            selectedPlaces.length > 0
          }
        >
          <Facet label="Genre">
            {genres.map((genre) => (
              <Chip
                key={genre}
                selected={selectedGenres.includes(genre)}
                pressed={selectedGenres.includes(genre)}
                onClick={() => update({ genres: toggle(selectedGenres, genre).join(",") })}
              >
                {genre}
              </Chip>
            ))}
          </Facet>

          {shownKeywords.length > 0 && (
            <Facet label="Tag">
              {shownKeywords.map((keyword) => (
                <Chip
                  key={keyword}
                  selected={selectedKeywords.includes(keyword)}
                  pressed={selectedKeywords.includes(keyword)}
                  onClick={() =>
                    update({
                      keywords: toggle(selectedKeywords, keyword).join(","),
                    })
                  }
                >
                  {keyword}
                </Chip>
              ))}
            </Facet>
          )}

          {shownPlaces.length > 0 && (
            <Facet label="Shot in">
              {shownPlaces.map((place) => (
                <Chip
                  key={place}
                  selected={selectedPlaces.includes(place)}
                  pressed={selectedPlaces.includes(place)}
                  onClick={() => update({ places: toggle(selectedPlaces, place).join(",") })}
                >
                  {place}
                </Chip>
              ))}
            </Facet>
          )}

          {filterable.length > 0 && (
            <Facet label="Source" wide>
              {filterable.slice(0, 24).map((provider) => (
                <Chip
                  key={provider.id}
                  selected={selectedProviders.includes(provider.id)}
                  pressed={selectedProviders.includes(provider.id)}
                  title={provider.name}
                  onClick={() =>
                    update({
                      providers: toggle(selectedProviders, provider.id).join(","),
                    })
                  }
                >
                  <ProviderBadge provider={provider} compact />
                  <small>{provider.name}</small>
                </Chip>
              ))}
            </Facet>
          )}
        </AdvancedFacets>

        {hasFilters && (
          <ClearFilters
            onClick={() =>
              update({
                genres: "",
                keywords: "",
                places: "",
                providers: "",
                q: "",
                sort: "",
              })
            }
          />
        )}
      </FilterBar>

      {browse.items.length > 0 && (
        <ErrorBoundary label="These listings">
          <ResultsGrid>
            {browse.items.map((item, index) => (
              <TitleCard
                key={item.id}
                item={item}
                onOpen={onOpen}
                rank={sort === "popularity" || sort === "trending" ? index + 1 : undefined}
              />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      )}

      {browse.isLoading && browse.items.length === 0 && <ResultsSkeleton count={8} />}

      {!browse.isLoading && browse.items.length === 0 && (
        <EmptyState
          heading={browse.error || "Nothing matches those filters."}
          description="Try removing a genre or a source."
        />
      )}

      {browse.hasMore && <LoadMore isLoading={browse.isLoading} onClick={browse.loadMore} />}
    </Page>
  );
}
