import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";

import { DetailPanel } from "./components/catalog";
import { SearchBox } from "./components/SearchBox";
import { GitHubIcon, MarqueeLogo } from "./components/ui";
import { ManagersDoor } from "./components/usher/ManagersDoor";
import { UsherCard } from "./components/usher/UsherCard";
import { UsherMark } from "./components/usher/UsherMark";
import { titlePath, type CatalogSection, type MediaTitle } from "./domain/catalog";
import { asideFor, type UsherMoment } from "./domain/usher";
import { useAiRails } from "./hooks/useAiRails";
import { useCatalog } from "./hooks/useCatalog";
import { useCurator } from "./hooks/useCurator";
import { usePinned } from "./hooks/usePinned";
import { useProfile } from "./hooks/useProfile";
import { useProviderPreferences } from "./hooks/useProviderPreferences";
import { useSearch } from "./hooks/useSearch";
import { useSession } from "./hooks/useSession";
import { useTitle } from "./hooks/useTitle";
import { useTonight } from "./hooks/useTonight";
import { useTrending } from "./hooks/useTrending";
import { useUsher } from "./hooks/useUsher";
import { AdminPage } from "./pages/AdminPage";
import { BrowsePage, type BrowsePreset } from "./pages/BrowsePage";
import { DigestPage } from "./pages/DigestPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SearchPage } from "./pages/SearchPage";
import { SignInPage } from "./pages/SignInPage";
import { SourcesPage } from "./pages/SourcesPage";
import { TonightPage } from "./pages/TonightPage";
import { UsherPage } from "./pages/UsherPage";
import type { EntryStatus, ViewingEntry } from "./types";

const TONIGHT_EPISODES = 16;
const HOME_DRIP_DELAY_MS = 45_000;

const NAV: { to: string; label: string; private: boolean; admin?: boolean }[] = [
  { to: "/", label: "Tonight", private: false },
  { to: "/listings", label: "Listings", private: false },
  { to: "/shelf", label: "My shelf", private: true },
  { to: "/this-week", label: "This week", private: true },
  { to: "/admin", label: "Admin", private: true, admin: true },
];

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
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const session = useSession();
  const isSignedIn = Boolean(session.user);
  const profile = useProfile(isSignedIn);
  const { selectedProviderIds, selectProviders } = useProviderPreferences();
  const isViewerReady = !session.isLoading && profile.isLoaded;
  const isHome = location.pathname === "/";
  const catalog = useCatalog(
    selectedProviderIds,
    profile.savedIds,
    isViewerReady && isHome,
    isViewerReady && (isHome || location.pathname === "/shelf"),
  );
  const search = useSearch(query, selectedProviderIds);
  const curator = useCurator();
  const usher = useUsher(isSignedIn);
  const pinned = usePinned(isSignedIn);
  const aiRails = useAiRails(isSignedIn && isViewerReady && isHome, profile.savedIds.join(","));
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
  const isTitlePath = (pathname: string) =>
    pathname.startsWith("/title/") || pathname.startsWith("/movie/") || pathname.startsWith("/tv/");
  const background =
    storedBackground && isTitlePath(storedBackground.pathname) ? undefined : storedBackground;
  const pageLocation =
    background ?? (titleMatch ? { ...location, pathname: "/", search: "" } : location);
  const pagePath = pageLocation.pathname;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pagePath]);

  const requestMoment = usher.request;
  const trimmedQuery = query.trim();
  const hasEmptySearch =
    pagePath === "/search" && Boolean(trimmedQuery) && !search.isSearching && !search.items.length;

  useEffect(() => {
    if (hasEmptySearch) {
      void requestMoment("search-empty", { query: trimmedQuery });
    }
  }, [hasEmptySearch, requestMoment, trimmedQuery]);

  const wantsDrip = isSignedIn && isHome && isViewerReady && !usher.isOnboarding;

  useEffect(() => {
    if (!wantsDrip) {
      return;
    }

    const timer = window.setTimeout(() => void requestMoment("home"), HOME_DRIP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [requestMoment, wantsDrip]);

  const openTitle = useCallback(
    (item: MediaTitle) => {
      void navigate(titlePath(item), {
        state: { background: background ?? (titleMatch ? undefined : location) },
      });
    },
    [background, location, navigate, titleMatch],
  );
  const closeDetails = useCallback(() => {
    if (background) {
      void navigate(-1);

      return;
    }

    void navigate("/");
  }, [background, navigate]);
  const sections = useMemo(
    () => [...pinned.sections, ...aiRails.sections, ...catalog.catalogue.sections],
    [aiRails.sections, catalog.catalogue, pinned.sections],
  );
  const heroSections = useMemo(
    () => [...pinned.sections, ...aiRails.heroSections, ...catalog.catalogue.sections],
    [aiRails.heroSections, catalog.catalogue, pinned.sections],
  );
  const isHeroReady =
    isViewerReady && !catalog.isLoading && aiRails.isResolved && pinned.isResolved;
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
        void usher.dismiss("once");
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

      void usher.dismiss("once");
    },
    [askCurator, profile, query, usher],
  );

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
        savedCount: profile.savedIds.length,
        unratedCount: Object.values(profile.entries).filter((entry) => entry.rating === null)
          .length,
      }),
    [profile.entries, profile.savedIds.length, requestMoment],
  );

  const onRailSeen = useCallback(
    (section: CatalogSection) => {
      void requestMoment("rail", { railId: section.id, railName: section.title });
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
    <main className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <MarqueeLogo />
          <span>Marquee</span>
        </Link>
        <nav aria-label="Primary navigation">
          {NAV.filter(
            (item) =>
              (!item.private || isSignedIn) && (!item.admin || session.user?.role === "admin"),
          ).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname === item.to ? "active" : ""}
              aria-current={location.pathname === item.to ? "page" : undefined}
            >
              {item.label}
              {item.to === "/shelf" && <sup>{profile.savedIds.length}</sup>}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <SearchBox
            query={query}
            results={search.items}
            isSearching={search.isSearching}
            onQueryChange={setQuery}
            onOpen={openTitle}
            onSubmit={() => {
              if (query.trim()) {
                curator.clear();
                void navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              }
            }}
          />
          {session.isLoading ? (
            <span className="session-loading">Checking session</span>
          ) : session.user ? (
            <div className="account-tools">
              {session.user.avatarUrl ? (
                <img src={session.user.avatarUrl} alt="" />
              ) : (
                <span className="avatar-fallback">{session.user.name.slice(0, 1)}</span>
              )}
              <span className="account-name">{session.user.name}</span>
              <button
                type="button"
                onClick={() => {
                  void session.logout();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              className="sign-in-button"
              to={`/sign-in?returnTo=${encodeURIComponent(`${pagePath}${location.search}`)}`}
              aria-label="Sign in"
            >
              <span className="sign-in-icon">
                <GitHubIcon />
              </span>
              <span className="sign-in-copy">
                <strong>Sign in</strong>
                <small>get a ticket</small>
              </span>
            </Link>
          )}
        </div>
      </header>

      {session.error && (
        <p className="auth-message" role="alert">
          {session.error}
        </p>
      )}

      <p className={`sync-message${profile.message ? " visible" : ""}`} aria-live="polite">
        {profile.message}
      </p>

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
              heroSections={heroSections}
              isHeroReady={isHeroReady}
              episodes={episodes}
              trending={trending}
              providers={catalog.providers}
              selectedProviderIds={selectedProviderIds}
              isPinned={isPinned}
              usherMoment={usher.moment}
              pick={usher.pick}
              aside={usher.aside}
              onAsk={askCurator}
              onClearCurator={clearAll}
              onOpen={openTitle}
              onPin={pinCurrentShelf}
              onPick={() => void usher.askForPick(selectedProviderIds)}
              onRejectPick={() => void usher.rejectPick(selectedProviderIds)}
              onSelectProviders={selectProviders}
              onShowSources={() => void navigate("/sources")}
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
          path="/sign-in"
          element={<SignInPage isSignedIn={isSignedIn} isSessionLoading={session.isLoading} />}
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
                entries={profile.entries}
                titles={catalog.savedTitles}
                catalogueError={catalog.error}
                usherMoment={usher.moment?.surface === "shelf" ? usher.moment : null}
                onClaim={(entry) => void profile.saveEntry(entry)}
                onDiscard={(titleId) => void profile.removeEntry(titleId)}
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
          path="/sources"
          element={
            <SourcesPage
              providers={catalog.providers}
              providerError={catalog.providerError}
              stats={catalog.providerStats}
              isSignedIn={isSignedIn}
              selectedProviderIds={selectedProviderIds}
              onSelectProviders={selectProviders}
            />
          }
        />

        <Route
          path="/admin"
          element={
            session.user?.role === "admin" ? <AdminPage user={session.user} /> : <ManagersDoor />
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

      {(routedTitleId || legacyMatch?.params.titleId) && (
        <TitleOverlay
          titleId={routedTitleId || (legacyMatch?.params.titleId ?? "")}
          usherMoment={usher.moment?.surface === "title" ? usher.moment : null}
          onUsherRequest={onTitleMoment}
          onUsherAction={onUsherAction}
          onUsherDismiss={(scope) => void usher.dismiss(scope)}
          titlesById={catalog.titlesById}
          searchItems={search.items}
          canSave={isSignedIn}
          entries={profile.entries}
          availabilityEnabled={catalog.providerSources.length > 0}
          onClose={closeDetails}
          onOpen={openTitle}
          onSave={(item) => void saveTitle(item)}
          onSaveEntry={(entry) => void profile.saveEntry(entry)}
          onRemove={(id) => void profile.removeEntry(id)}
          onStatus={profile.setStatus}
          onUpdateDraft={profile.updateDraft}
        />
      )}

      <footer className="site-footer">
        <div className="brand">
          <MarqueeLogo />
          <span>Marquee</span>
        </div>
        <p>
          Data by TMDB · Availability by Watchmode and JustWatch ·{" "}
          <Link className="footer-link" to="/sources">
            Services and sources
          </Link>
        </p>
        <Link className="footer-egg" to="/usher">
          Made for movie night
        </Link>
      </footer>
    </main>
  );
}

function SignedOutShelf() {
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>My shelf</h1>
        </div>
        <p>Sign in to keep a shelf of what you have watched.</p>
      </div>
      <div className="search-empty">
        <h2>You are signed out.</h2>
        <p>Your shelf lives with your account, so sign in to see it.</p>
        <Link className="button-link" to="/sign-in?returnTo=%2Fshelf">
          Get a ticket
        </Link>
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>Not found</h1>
        </div>
        <p>That page does not exist.</p>
      </div>
      <div className="search-empty lost">
        <UsherMark face="unimpressed" crop="head" />
        <h2>Wrong door.</h2>
        <p>Nothing showing down here. The screens are the other way.</p>
        <div className="lost-actions">
          <Link className="button-link" to="/">
            Back to tonight
          </Link>
          <Link className="lost-aside" to="/usher">
            Who are you, anyway?
          </Link>
        </div>
      </div>
    </section>
  );
}

function TitleOverlay({
  titleId,
  titlesById,
  searchItems,
  canSave,
  entries,
  usherMoment,
  onUsherRequest,
  onUsherAction,
  onUsherDismiss,
  availabilityEnabled,
  onClose,
  onOpen,
  onSave,
  onSaveEntry,
  onRemove,
  onStatus,
  onUpdateDraft,
}: {
  titleId: string;
  titlesById: Map<string, MediaTitle>;
  searchItems: MediaTitle[];
  canSave: boolean;
  entries: Record<string, ViewingEntry>;
  usherMoment: UsherMoment | null;
  onUsherRequest: (titleId: string) => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherDismiss: (scope: "once" | "kind") => void;
  availabilityEnabled: boolean;
  onClose: () => void;
  onOpen: (item: MediaTitle) => void;
  onSave: (item: MediaTitle) => void;
  onSaveEntry: (entry: ViewingEntry) => void;
  onRemove: (titleId: string) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
}) {
  const known = useMemo(
    () =>
      new Map([...titlesById, ...searchItems.map((item): [string, MediaTitle] => [item.id, item])]),
    [searchItems, titlesById],
  );
  const { title, isLoading } = useTitle(titleId, known);
  const isSaved = Boolean(entries[titleId]);

  useEffect(() => {
    if (isSaved) {
      onUsherRequest(titleId);
    }
  }, [isSaved, onUsherRequest, titleId]);

  if (isLoading || !title) {
    return null;
  }

  return (
    <DetailPanel
      item={title}
      canSave={canSave}
      entry={entries[title.id]}
      usherSlot={
        usherMoment ? (
          <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
        ) : undefined
      }
      availabilityEnabled={availabilityEnabled}
      onClose={onClose}
      onOpen={onOpen}
      onSave={onSave}
      onSaveEntry={onSaveEntry}
      onRemove={onRemove}
      onStatus={onStatus}
      onUpdateDraft={onUpdateDraft}
    />
  );
}
