import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { SearchBox } from "./components/SearchBox";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { TitleOverlay } from "./components/TitleOverlay";
import { ManagersDoor } from "./components/usher/ManagersDoor";
import {
  groupHomeSections,
  titlePath,
  weaveSections,
  type CatalogSection,
  type MediaTitle,
} from "./domain/catalog";
import { asideFor, type UsherMoment } from "./domain/usher";
import { useCatalog } from "./hooks/useCatalog";
import { useCurator } from "./hooks/useCurator";
import { useFeaturedTitle } from "./hooks/useFeaturedTitle";
import { usePageMetadata } from "./hooks/usePageMetadata";
import { usePinned } from "./hooks/usePinned";
import { useProfile } from "./hooks/useProfile";
import { useProviderPreferences } from "./hooks/useProviderPreferences";
import { useRails } from "./hooks/useRails";
import { useSearch } from "./hooks/useSearch";
import { useSession } from "./hooks/useSession";
import { useTitle } from "./hooks/useTitle";
import { useTonight } from "./hooks/useTonight";
import { useTrending } from "./hooks/useTrending";
import { useUsher } from "./hooks/useUsher";
import { aliasTarget, ROUTE_ALIASES } from "./lib/aliases";
import { classNames } from "./lib/class-names";
import { APP_INSTANCE } from "./lib/navigation";
import { titleForItem, titleForRoute } from "./lib/page-title";
import type { BrowsePreset } from "./pages/BrowsePage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignedOutShelf } from "./pages/SignedOutShelf";
import { TonightPage } from "./pages/TonightPage";
import { Page, StatusNote } from "./ui";

import styles from "./App.module.css";

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
const SignInPage = lazy(() =>
  import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const PrivacyPolicyPage = lazy(() =>
  import("./pages/PrivacyPolicyPage").then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
);
const TermsPage = lazy(() => import("./pages/TermsPage").then((m) => ({ default: m.TermsPage })));
const SourcesPage = lazy(() =>
  import("./pages/SourcesPage").then((m) => ({ default: m.SourcesPage })),
);
const UsherPage = lazy(() => import("./pages/UsherPage").then((m) => ({ default: m.UsherPage })));
const ScreeningPage = lazy(() =>
  import("./pages/ScreeningPage").then((m) => ({ default: m.ScreeningPage })),
);
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const TrailersPage = lazy(() =>
  import("./pages/TrailersPage").then((m) => ({ default: m.TrailersPage })),
);
const RevivalPage = lazy(() =>
  import("./pages/RevivalPage").then((m) => ({ default: m.RevivalPage })),
);
const RevivalScreenPage = lazy(() =>
  import("./pages/RevivalScreenPage").then((m) => ({
    default: m.RevivalScreenPage,
  })),
);
const TourPage = lazy(() => import("./pages/TourPage").then((m) => ({ default: m.TourPage })));
const NotebookPage = lazy(() =>
  import("./pages/NotebookPage").then((m) => ({ default: m.NotebookPage })),
);

function RouteFallback() {
  return (
    <Page>
      <StatusNote busy>Loading…</StatusNote>
    </Page>
  );
}

const TONIGHT_EPISODES = 16;
const HOME_DRIP_DELAY_MS = 45_000;

function isTitlePath(pathname: string) {
  return (
    pathname.startsWith("/title/") || pathname.startsWith("/movie/") || pathname.startsWith("/tv/")
  );
}

function AliasRedirect({ alias }: { alias: string }) {
  const { search } = useLocation();

  return <Navigate to={aliasTarget(alias, search) ?? "/"} replace />;
}

const LISTINGS: BrowsePreset = {
  title: "Listings",
  description: "Everything in the building. Narrow it down and I will get out of your way.",
  sort: "popularity",
};

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");

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
  const search = useSearch(query, selectedProviderIds, isViewerReady);
  const curator = useCurator();
  const usher = useUsher(session.user?.id ?? "");
  const pinned = usePinned(isSignedIn);
  const rails = useRails(
    session.user?.id ?? "",
    isSignedIn && isViewerReady && isHome && usher.isOnboardingResolved && !usher.isOnboarding,
    profile.shelfKey,
  );
  const episodes = useTonight(isViewerReady && isHome, TONIGHT_EPISODES);
  const trending = useTrending(isViewerReady && isHome);
  const movieMatch = useMatch("/movie/:tmdbId/*");
  const seriesMatch = useMatch("/tv/:tmdbId/*");
  const legacyMatch = useMatch("/title/:titleId");
  const openMediaType = movieMatch ? "movie" : seriesMatch ? "tv" : null;
  const openTmdbId = (movieMatch ?? seriesMatch)?.params.tmdbId ?? "";
  const routedTitleId = openMediaType && openTmdbId ? `${openMediaType}:${openTmdbId}` : "";
  const titleMatch = Boolean(routedTitleId || legacyMatch);
  const openedState = location.state as {
    background?: typeof location;
    instance?: string;
  } | null;
  const storedBackground =
    openedState?.instance === APP_INSTANCE ? openedState.background : undefined;
  const background =
    storedBackground && isTitlePath(storedBackground.pathname) ? undefined : storedBackground;
  const isOverlay = titleMatch && Boolean(background);
  const pageLocation = background ?? location;
  const pagePath = pageLocation.pathname;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // oxlint-disable-next-line exhaustive-effect-dependencies -- rerun on navigation
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
  const pageQuery = (new URLSearchParams(pageLocation.search).get("q") ?? "").trim();

  const fallbackTitle = openTitleId
    ? openDetails.title
      ? titleForItem(openDetails.title)
      : ""
    : titleForRoute(pagePath, pageQuery);

  usePageMetadata(`${location.pathname}${location.search}`, fallbackTitle);

  const rescueQueryRef = useRef("");
  const onEmptyListings = useCallback(
    (emptyQuery: string) => {
      rescueQueryRef.current = emptyQuery;
      void requestMoment("search-empty", { query: emptyQuery });
    },
    [requestMoment],
  );

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
        state: {
          background: openBackgroundRef.current,
          instance: APP_INSTANCE,
        },
        viewTransition: true,
      });
    },
    [navigate],
  );
  const closeDetails = useCallback(() => {
    if (background) {
      void navigate(-1);

      return;
    }

    void navigate("/", { viewTransition: true });
  }, [background, navigate]);
  const sectionGroups = useMemo(
    () =>
      groupHomeSections(pinned.sections, rails.curated, rails.personal, catalog.catalogue.sections),
    [catalog.catalogue, pinned.sections, rails.curated, rails.personal],
  );
  const heroSections = useMemo(
    () =>
      weaveSections(pinned.sections, rails.heroCurated, rails.personal, catalog.catalogue.sections),
    [catalog.catalogue, pinned.sections, rails.heroCurated, rails.personal],
  );
  const featured = featuredTitle.item ?? heroSections.flatMap((section) => section.items)[0];
  const isHeroReady =
    isViewerReady && !catalog.isLoading && featuredTitle.isResolved && pinned.isResolved;
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
        void askCurator(rescueQueryRef.current);

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
    [askCurator, profile, usher],
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

  const titleView = openTitleId ? (
    <ErrorBoundary label="The title card" resetKey={openTitleId} onRetry={closeDetails}>
      <TitleOverlay
        layout={isOverlay ? "overlay" : "page"}
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
  ) : null;

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
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
          <ErrorBoundary label="The search box" compact resetKey={pagePath}>
            <SearchBox
              query={query}
              results={search.items}
              isSearching={search.isSearching}
              isRefining={search.isRefining}
              onQueryChange={setQuery}
              onOpen={openTitle}
              onSubmit={() => {
                const trimmed = query.trim();

                curator.clear();
                void navigate(trimmed ? `/listings?q=${encodeURIComponent(trimmed)}` : "/listings");
              }}
            />
          </ErrorBoundary>
        }
      />

      {session.error && (
        <p className={styles.authMessage} role="alert">
          {session.error}
        </p>
      )}

      <p
        className={classNames(styles.syncMessage, profile.message && styles.syncMessageVisible)}
        aria-live="polite"
      >
        {profile.message}
      </p>

      <main id="main-content">
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
                    isBuildingRails={rails.isGenerating}
                    isSessionLoading={!isViewerReady}
                    error={catalog.error}
                    providerError={catalog.providerError}
                    sectionGroups={sectionGroups}
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
                path="/screening"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <ScreeningPage
                      isSignedIn={isSignedIn}
                      isAdmin={session.user?.role === "admin"}
                    />
                  </Suspense>
                }
              />

              <Route
                path="/tour"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TourPage
                      isSignedIn={isSignedIn}
                      isAdmin={session.user?.role === "admin"}
                      pad={{
                        state: usher.order,
                        guests: usher.guests,
                        onStart: usher.openOrder,
                        onSubmit: (order, guestIds) =>
                          void usher.placeOrder(order, selectedProviderIds, guestIds),
                        onAnother: () => void usher.reorder(selectedProviderIds),
                        onEdit: usher.editOrder,
                      }}
                      onOpen={openTitle}
                    />
                  </Suspense>
                }
              />

              <Route
                path="/trailers"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TrailersPage
                      isReady={isViewerReady}
                      isSignedIn={isSignedIn}
                      entryStates={profile.entryStates}
                      onLoadEntry={profile.loadEntry}
                      onOpen={openTitle}
                      onSave={(item) => void saveTitle(item)}
                    />
                  </Suspense>
                }
              />

              <Route
                path="/revival"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RevivalPage isReady={isViewerReady} isSignedIn={isSignedIn} />
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

              <Route path="/privacy" element={<PrivacyPolicyPage />} />

              <Route path="/terms" element={<TermsPage />} />

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
                    <SignedOutShelf isLoading={session.isLoading} />
                  )
                }
              />

              <Route
                path="/person/:id"
                element={<PersonPage isSignedIn={isSignedIn} onOpen={openTitle} />}
              />

              <Route path="/collection/:id" element={<CollectionPage onOpen={openTitle} />} />

              <Route path="/directory" element={<DirectoryPage />} />

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
                  <BrowsePage
                    preset={LISTINGS}
                    providers={catalog.providers}
                    usherMoment={usher.moment?.surface === "search-empty" ? usher.moment : null}
                    onOpen={openTitle}
                    onUsherRequest={onEmptyListings}
                    onUsherAction={onUsherAction}
                    onUsherDismiss={(scope) => void usher.dismiss(scope)}
                  />
                }
              />

              <Route path="/movie/:tmdbId/*" element={titleView} />
              <Route path="/tv/:tmdbId/*" element={titleView} />
              <Route path="/title/:titleId" element={titleView} />

              {Object.keys(ROUTE_ALIASES).map((path) => (
                <Route key={path} path={path} element={<AliasRedirect alias={path} />} />
              ))}

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {isOverlay && titleView}

      <SiteFooter />
    </div>
  );
}
