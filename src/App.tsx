import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { SearchBox } from "./components/SearchBox";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { TitleOverlay } from "./components/TitleOverlay";
import { ManagersDoor } from "./components/usher/ManagersDoor";
import { titlePath, weaveSections, type CatalogSection, type MediaTitle } from "./domain/catalog";
import { asideFor, type UsherMoment } from "./domain/usher";
import { useAiRails } from "./hooks/useAiRails";
import { useCatalog } from "./hooks/useCatalog";
import { useCurator } from "./hooks/useCurator";
import { useFeaturedTitle } from "./hooks/useFeaturedTitle";
import { usePersonalRails } from "./hooks/usePersonalRails";
import { usePinned } from "./hooks/usePinned";
import { useProfile } from "./hooks/useProfile";
import { useProviderPreferences } from "./hooks/useProviderPreferences";
import { useSearch } from "./hooks/useSearch";
import { useSession } from "./hooks/useSession";
import { useTitle } from "./hooks/useTitle";
import { useTonight } from "./hooks/useTonight";
import { useTrending } from "./hooks/useTrending";
import { useUsher } from "./hooks/useUsher";
import { titleForItem, titleForRoute } from "./lib/page-title";
import type { BrowsePreset } from "./pages/BrowsePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignedOutShelf } from "./pages/SignedOutShelf";
import { TonightPage } from "./pages/TonightPage";

const BrowsePage = lazy(() =>
  import("./pages/BrowsePage").then((m) => ({ default: m.BrowsePage })),
);
const CollectionPage = lazy(() =>
  import("./pages/CollectionPage").then((m) => ({ default: m.CollectionPage })),
);
const DigestPage = lazy(() =>
  import("./pages/DigestPage").then((m) => ({ default: m.DigestPage })),
);
const LibraryPage = lazy(() =>
  import("./pages/LibraryPage").then((m) => ({ default: m.LibraryPage })),
);
const PersonPage = lazy(() =>
  import("./pages/PersonPage").then((m) => ({ default: m.PersonPage })),
);
const SearchPage = lazy(() =>
  import("./pages/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const SignInPage = lazy(() =>
  import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const SourcesPage = lazy(() =>
  import("./pages/SourcesPage").then((m) => ({ default: m.SourcesPage })),
);
const UsherPage = lazy(() => import("./pages/UsherPage").then((m) => ({ default: m.UsherPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const RevivalPage = lazy(() =>
  import("./pages/RevivalPage").then((m) => ({ default: m.RevivalPage })),
);
const RevivalScreenPage = lazy(() =>
  import("./pages/RevivalScreenPage").then((m) => ({
    default: m.RevivalScreenPage,
  })),
);
const NotebookPage = lazy(() =>
  import("./pages/NotebookPage").then((m) => ({ default: m.NotebookPage })),
);

function RouteFallback() {
  return (
    <section className="page-section">
      <p className="availability-empty">
        <i className="availability-spinner" aria-hidden="true" />
        Loading…
      </p>
    </section>
  );
}

const TONIGHT_EPISODES = 16;
const HOME_DRIP_DELAY_MS = 45_000;

function isTitlePath(pathname: string) {
  return (
    pathname.startsWith("/title/") || pathname.startsWith("/movie/") || pathname.startsWith("/tv/")
  );
}

const LEGACY_BROWSE: Record<string, string> = {
  "/films": "type=movie",
  "/series": "type=tv",
  "/new": "sort=recent",
  "/popular": "sort=popularity",
};

function LegacyBrowse({ preset }: { preset: string }) {
  const { search } = useLocation();
  const merged = new URLSearchParams(search);

  for (const [key, value] of new URLSearchParams(preset)) {
    merged.set(key, value);
  }

  return <Navigate to={`/listings?${merged.toString()}`} replace />;
}

const LISTINGS: BrowsePreset = {
  title: "Listings",
  description: "Everything in the building. Narrow it down and I will get out of your way.",
  sort: "popularity",
};

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState(() =>
    location.pathname === "/search" ? (new URLSearchParams(location.search).get("q") ?? "") : "",
  );
  const [queryLocationKey, setQueryLocationKey] = useState(location.key);

  if (queryLocationKey !== location.key) {
    setQueryLocationKey(location.key);

    if (location.pathname === "/search") {
      setQuery(new URLSearchParams(location.search).get("q") ?? "");
    }
  }

  const session = useSession();
  const isSignedIn = Boolean(session.user);
  const profile = useProfile(isSignedIn);
  const {
    selectedProviderIds,
    selectProviders,
    isResolved: providersResolved,
  } = useProviderPreferences(isSignedIn);
  const isViewerReady = !session.isLoading && profile.isLoaded && providersResolved;
  const isHome = location.pathname === "/";
  const catalog = useCatalog(selectedProviderIds, isViewerReady && isHome);
  const featuredTitle = useFeaturedTitle(
    selectedProviderIds,
    isViewerReady && isHome,
    profile.shelfKey,
  );
  const search = useSearch(query, selectedProviderIds);
  const curator = useCurator();
  const usher = useUsher(isSignedIn);
  const pinned = usePinned(isSignedIn);
  const aiRails = useAiRails(isSignedIn && isViewerReady && isHome, profile.shelfKey);
  const personalRails = usePersonalRails(isSignedIn && isViewerReady && isHome, profile.shelfKey);
  const episodes = useTonight(isViewerReady, TONIGHT_EPISODES);
  const trending = useTrending(isViewerReady && isHome);
  const movieMatch = useMatch("/movie/:tmdbId/*");
  const seriesMatch = useMatch("/tv/:tmdbId/*");
  const legacyMatch = useMatch("/title/:titleId");
  const openMediaType = movieMatch ? "movie" : seriesMatch ? "tv" : null;
  const openTmdbId = (movieMatch ?? seriesMatch)?.params.tmdbId ?? "";
  const routedTitleId = openMediaType && openTmdbId ? `${openMediaType}:${openTmdbId}` : "";
  const titleMatch = Boolean(routedTitleId || legacyMatch);
  const storedBackground = (location.state as { background?: typeof location } | null)?.background;
  const background =
    storedBackground && isTitlePath(storedBackground.pathname) ? undefined : storedBackground;
  const pageLocation =
    background ?? (titleMatch ? { ...location, pathname: "/", search: "" } : location);
  const pagePath = pageLocation.pathname;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pagePath]);

  const openTitleId = routedTitleId || (legacyMatch?.params.titleId ?? "");
  const knownTitles = useMemo(
    () =>
      new Map([
        ...catalog.titlesById,
        ...search.items.map((item): [string, MediaTitle] => [item.id, item]),
      ]),
    [catalog.titlesById, search.items],
  );
  const openDetails = useTitle(openTitleId || undefined, knownTitles);

  const requestMoment = usher.request;
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (openTitleId) {
      if (openDetails.title) {
        document.title = titleForItem(openDetails.title);
      }

      return;
    }

    document.title = titleForRoute(pagePath, trimmedQuery);
  }, [openDetails.title, openTitleId, pagePath, trimmedQuery]);

  const hasEmptySearch =
    pagePath === "/search" &&
    Boolean(trimmedQuery) &&
    !search.isSearching &&
    !search.isRefining &&
    !search.items.length;

  useEffect(() => {
    if (hasEmptySearch) {
      void requestMoment("search-empty", { query: trimmedQuery });
    }
  }, [hasEmptySearch, requestMoment, trimmedQuery]);

  const wantsDrip = isSignedIn && isHome && isViewerReady && !usher.isOnboarding;

  useEffect(() => {
    if (!wantsDrip) {
      return undefined;
    }

    const timer = window.setTimeout(() => void requestMoment("home"), HOME_DRIP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [requestMoment, wantsDrip]);

  const openBackgroundRef = useRef<typeof location | undefined>(undefined);

  useEffect(() => {
    openBackgroundRef.current = background ?? (titleMatch ? undefined : location);
  });

  const openTriggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (wasOpenRef.current && !openTitleId) {
      const trigger = openTriggerRef.current;

      openTriggerRef.current = null;

      if (trigger?.isConnected) {
        trigger.focus();
      }
    }

    wasOpenRef.current = Boolean(openTitleId);
  }, [openTitleId]);

  const openTitle = useCallback(
    (item: MediaTitle) => {
      openTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void navigate(titlePath(item), {
        state: { background: openBackgroundRef.current },
      });
    },
    [navigate],
  );
  const closeDetails = useCallback(() => {
    if (background) {
      void navigate(-1);

      return;
    }

    void navigate("/");
  }, [background, navigate]);
  const sections = useMemo(
    () =>
      weaveSections(
        pinned.sections,
        aiRails.sections,
        personalRails.sections,
        catalog.catalogue.sections,
      ),
    [aiRails.sections, catalog.catalogue, personalRails.sections, pinned.sections],
  );
  const heroSections = useMemo(
    () =>
      weaveSections(
        pinned.sections,
        aiRails.heroSections,
        personalRails.sections,
        catalog.catalogue.sections,
      ),
    [aiRails.heroSections, catalog.catalogue, personalRails.sections, pinned.sections],
  );
  const featured = featuredTitle.item ?? heroSections.flatMap((section) => section.items)[0];
  const isHeroReady =
    isViewerReady &&
    !catalog.isLoading &&
    featuredTitle.isResolved &&
    aiRails.isResolved &&
    pinned.isResolved &&
    personalRails.isResolved;
  const isPinned = Boolean(curator.state.prompt && pinned.pinnedPrompt === curator.state.prompt);

  const pinCurrentShelf = useCallback(() => {
    if (curator.state.items.length < 2) {
      return;
    }

    void pinned.pin({
      name: curator.state.prompt.slice(0, 60),
      prompt: curator.state.prompt,
      reason: curator.state.summary.slice(0, 200),
      titleIds: curator.state.items.map((item) => item.id),
    });
  }, [curator.state, pinned]);

  const askCurator = useCallback(
    async (prompt: string, isRefinement = false) => {
      const aside = isRefinement ? null : asideFor(prompt);

      if (aside) {
        curator.clear();
        usher.say(aside);

        return;
      }

      usher.clearPick();
      await curator.ask(prompt, isRefinement, selectedProviderIds);
    },
    [curator, selectedProviderIds, usher],
  );

  const onUsherAction = useCallback(
    (moment: UsherMoment, actionId: string) => {
      if (moment.kind === "rail-feedback") {
        const railId = moment.id.replace("rail-feedback:", "");

        void usher.railVerdict(railId, actionId === "bad" ? "bad" : "good");

        return;
      }

      if (moment.kind === "search-rescue" && actionId === "rescue") {
        void usher.dismiss("acknowledged");
        void askCurator(query);

        return;
      }

      if (moment.kind === "stale-watchlist") {
        const titleId = moment.id.replace("stale-watchlist:", "");

        if (actionId === "drop") {
          void profile.removeEntry(titleId);
        }

        if (actionId === "watched") {
          profile.setStatus(titleId, "watched");
        }
      }

      void usher.dismiss("acknowledged");
    },
    [askCurator, profile, query, usher],
  );

  const askForTicket = useCallback(() => {
    void navigate(`/sign-in?returnTo=${encodeURIComponent("/")}`);
  }, [navigate]);

  const clearAll = useCallback(() => {
    curator.clear();
    usher.clearPick();
  }, [curator, usher]);

  const onUsherAnswer = useCallback(
    async (questionId: string, value: unknown) => {
      const saved = await usher.answer(questionId, value);

      if (questionId === "providers" && Array.isArray(saved)) {
        selectProviders(saved.filter((id): id is string => typeof id === "string"));
      }

      return saved;
    },
    [selectProviders, usher],
  );

  const onTitleMoment = useCallback(
    (titleId: string) => void requestMoment("title", { titleId }),
    [requestMoment],
  );

  const onShelfMoment = useCallback(
    () =>
      void requestMoment("shelf", {
        savedCount: profile.shelved,
        unratedCount: profile.unrated,
      }),
    [profile.shelved, profile.unrated, requestMoment],
  );

  const onRailSeen = useCallback(
    (section: CatalogSection) => {
      void requestMoment("rail", {
        railId: section.id,
        railName: section.title,
      });
    },
    [requestMoment],
  );

  async function saveTitle(item: MediaTitle) {
    await profile.saveEntry(
      profile.entries[item.id] ?? {
        titleId: item.id,
        status: "watchlist",
        rating: null,
        thoughts: "",
      },
    );
  }

  return (
    <div className="site-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader
        user={session.user}
        isSessionLoading={session.isLoading}
        currentPath={location.pathname}
        returnTo={`${pagePath}${location.search}`}
        shelvedCount={profile.shelved}
        onSignOut={() => void session.logout()}
        searchSlot={
          <ErrorBoundary label="The search box" resetKey={pagePath}>
            <SearchBox
              query={query}
              results={search.items}
              isSearching={search.isSearching}
              isRefining={search.isRefining}
              onQueryChange={setQuery}
              onOpen={openTitle}
              onSubmit={() => {
                if (query.trim()) {
                  curator.clear();
                  void navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                }
              }}
            />
          </ErrorBoundary>
        }
      />

      {session.error && (
        <p className="auth-message" role="alert">
          {session.error}
        </p>
      )}

      <p className={`sync-message${profile.message ? " visible" : ""}`} aria-live="polite">
        {profile.message}
      </p>

      <main id="main-content" className="site-main">
        <ErrorBoundary
          variant="page"
          label="this page"
          resetKey={`${pagePath}${pageLocation.search}`}
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes location={pageLocation}>
              <Route
                path="/"
                element={
                  <TonightPage
                    curator={curator.state}
                    curatorError={curator.error}
                    isAsking={curator.isAsking}
                    isLoading={catalog.isLoading || !isViewerReady}
                    isBuildingRails={aiRails.isGenerating}
                    isSessionLoading={!isViewerReady}
                    error={catalog.error}
                    providerError={catalog.providerError}
                    sections={sections}
                    featured={featured}
                    isHeroReady={isHeroReady}
                    episodes={episodes}
                    trending={trending}
                    providers={catalog.providers}
                    selectedProviderIds={selectedProviderIds}
                    isPinned={isPinned}
                    usherMoment={usher.moment}
                    pick={usher.pick}
                    order={usher.order}
                    guests={usher.guests}
                    aside={usher.aside}
                    onAsk={askCurator}
                    onClearCurator={clearAll}
                    onOpen={openTitle}
                    onPin={pinCurrentShelf}
                    onPick={() =>
                      isSignedIn ? void usher.askForPick(selectedProviderIds) : askForTicket()
                    }
                    onRejectPick={(scope) => void usher.rejectPick(selectedProviderIds, scope)}
                    onStartOrder={() => (isSignedIn ? usher.openOrder() : askForTicket())}
                    onOrder={(order, guestIds) =>
                      void usher.placeOrder(order, selectedProviderIds, guestIds)
                    }
                    onOrderAnother={() => void usher.reorder(selectedProviderIds)}
                    onOrderEdit={usher.editOrder}
                    onSelectProviders={selectProviders}
                    onShowSources={() => void navigate("/notebook#services")}
                    onUsherAction={onUsherAction}
                    onUsherAnswer={onUsherAnswer}
                    onUsherDismiss={(scope) => void usher.dismiss(scope)}
                    onUsherSkip={(questionId) => void usher.skip(questionId)}
                    onRailSeen={onRailSeen}
                  />
                }
              />

              <Route path="/usher" element={<UsherPage />} />

              <Route
                path="/revival"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RevivalPage isReady={isViewerReady} />
                  </Suspense>
                }
              />

              <Route
                path="/revival/:workId"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RevivalScreenPage isSignedIn={isSignedIn} />
                  </Suspense>
                }
              />

              <Route
                path="/notebook"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <NotebookPage
                      isSignedIn={isSignedIn}
                      providers={catalog.providers}
                      providerError={catalog.providerError}
                      providerStats={catalog.providerStats}
                      selectedProviderIds={selectedProviderIds}
                      onSelectProviders={selectProviders}
                    />
                  </Suspense>
                }
              />

              <Route
                path="/sign-in"
                element={
                  <SignInPage isSignedIn={isSignedIn} isSessionLoading={session.isLoading} />
                }
              />

              <Route
                path="/this-week"
                element={
                  <DigestPage
                    isSignedIn={isSignedIn}
                    isSessionLoading={session.isLoading}
                    onOpen={openTitle}
                  />
                }
              />

              <Route
                path="/search"
                element={
                  <SearchPage
                    query={query}
                    items={search.items}
                    error={search.error}
                    isSearching={search.isSearching}
                    isRefining={search.isRefining}
                    usherMoment={usher.moment?.surface === "search-empty" ? usher.moment : null}
                    onUsherAction={onUsherAction}
                    onUsherDismiss={(scope) => void usher.dismiss(scope)}
                    onOpen={openTitle}
                    onShowTonight={() => {
                      setQuery("");
                      void navigate("/");
                    }}
                  />
                }
              />

              <Route
                path="/shelf"
                element={
                  isSignedIn ? (
                    <LibraryPage
                      isSignedIn={isSignedIn}
                      usherMoment={usher.moment?.surface === "shelf" ? usher.moment : null}
                      onClaim={(entry) => profile.saveEntry(entry)}
                      onDiscard={(titleId) => profile.removeEntry(titleId)}
                      onUsherRequest={onShelfMoment}
                      onUsherAction={onUsherAction}
                      onUsherDismiss={(scope) => void usher.dismiss(scope)}
                      onOpen={openTitle}
                      onShowTonight={() => void navigate("/")}
                    />
                  ) : (
                    <SignedOutShelf />
                  )
                }
              />

              <Route
                path="/person/:name"
                element={<PersonPage isSignedIn={isSignedIn} onOpen={openTitle} />}
              />

              <Route path="/collection/:id" element={<CollectionPage onOpen={openTitle} />} />

              <Route
                path="/sources"
                element={
                  <SourcesPage
                    providers={catalog.providers}
                    providerError={catalog.providerError}
                    stats={catalog.providerStats}
                  />
                }
              />

              <Route
                path="/admin"
                element={
                  session.user?.role === "admin" ? (
                    <Suspense fallback={<RouteFallback />}>
                      <AdminPage user={session.user} />
                    </Suspense>
                  ) : (
                    <ManagersDoor />
                  )
                }
              />

              <Route
                path="/listings"
                element={
                  <BrowsePage preset={LISTINGS} providers={catalog.providers} onOpen={openTitle} />
                }
              />

              {Object.entries(LEGACY_BROWSE).map(([path, preset]) => (
                <Route key={path} path={path} element={<LegacyBrowse preset={preset} />} />
              ))}

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {openTitleId && (
        <ErrorBoundary label="The title card" resetKey={openTitleId} onRetry={closeDetails}>
          <TitleOverlay
            titleId={openTitleId}
            usherMoment={usher.moment?.surface === "title" ? usher.moment : null}
            onUsherRequest={onTitleMoment}
            onUsherAction={onUsherAction}
            onUsherDismiss={(scope) => void usher.dismiss(scope)}
            title={openDetails.title}
            isMissing={openDetails.isMissing}
            isLoading={openDetails.isLoading}
            titleError={openDetails.error}
            canSave={isSignedIn}
            entryState={profile.entryStates[openTitleId]}
            selectedProviderIds={selectedProviderIds}
            availabilityEnabled={catalog.providerSources.length > 0}
            onClose={closeDetails}
            onOpen={openTitle}
            onSave={(item) => void saveTitle(item)}
            onSaveEntry={(entry) => void profile.saveEntry(entry)}
            onRemove={(id) => void profile.removeEntry(id)}
            onStatus={profile.setStatus}
            onUpdateDraft={profile.updateDraft}
            onTracked={profile.refresh}
            onLoadEntry={profile.loadEntry}
            onRetryTitle={openDetails.reload}
          />
        </ErrorBoundary>
      )}

      <SiteFooter />
    </div>
  );
}
