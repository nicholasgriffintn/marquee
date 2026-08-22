import { useCallback, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation, useMatch, useNavigate } from "react-router-dom";

import { DetailPanel } from "./components/catalog";
import { SearchBox } from "./components/SearchBox";
import { GitHubIcon, MarqueeLogo } from "./components/ui";
import type { MediaTitle } from "./domain/catalog";
import { useAiRails } from "./hooks/useAiRails";
import { useCatalog } from "./hooks/useCatalog";
import { useCurator } from "./hooks/useCurator";
import { useProfile } from "./hooks/useProfile";
import { useSearch } from "./hooks/useSearch";
import { useSession } from "./hooks/useSession";
import { useTitle } from "./hooks/useTitle";
import { useTonight } from "./hooks/useTonight";
import { BrowsePage, type BrowsePreset } from "./pages/BrowsePage";
import { LibraryPage } from "./pages/LibraryPage";
import { SearchPage } from "./pages/SearchPage";
import { SourcesPage } from "./pages/SourcesPage";
import { TonightPage } from "./pages/TonightPage";
import type { EntryStatus, ViewingEntry } from "./types";

const NAV: { to: string; label: string; private: boolean }[] = [
  { to: "/", label: "Tonight", private: false },
  { to: "/films", label: "Films", private: false },
  { to: "/series", label: "Series", private: false },
  { to: "/new", label: "New", private: false },
  { to: "/popular", label: "Popular", private: false },
  { to: "/shelf", label: "My shelf", private: true },
  { to: "/sources", label: "Sources", private: false },
];

const BROWSE_PRESETS: Record<string, BrowsePreset> = {
  "/films": {
    title: "Films",
    description: "Every film in the Marquee catalogue.",
    mediaType: "movie",
    sort: "popularity",
  },
  "/series": {
    title: "Series",
    description: "Every series in the Marquee catalogue.",
    mediaType: "tv",
    sort: "popularity",
  },
  "/new": {
    title: "New",
    description: "The most recent additions, newest first.",
    sort: "recent",
  },
  "/popular": {
    title: "Popular",
    description: "What people are watching right now.",
    sort: "popularity",
  },
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
  const isViewerReady = !session.isLoading && profile.isLoaded;
  const isHome = location.pathname === "/";
  const catalog = useCatalog(
    profile.selectedProviderIds,
    profile.savedIds,
    isViewerReady && isHome,
    isViewerReady && (isHome || location.pathname === "/shelf"),
  );
  const search = useSearch(query, profile.selectedProviderIds);
  const curator = useCurator();
  const aiRails = useAiRails(isSignedIn && isViewerReady && isHome, profile.savedIds.join(","));
  const episodes = useTonight(isViewerReady);
  const titleMatch = useMatch("/title/:titleId");
  const storedBackground = (location.state as { background?: typeof location } | null)?.background;
  const background = storedBackground?.pathname.startsWith("/title/")
    ? undefined
    : storedBackground;
  const pageLocation =
    background ?? (titleMatch ? { ...location, pathname: "/", search: "" } : location);
  const openTitle = useCallback(
    (item: MediaTitle) => {
      void navigate(`/title/${encodeURIComponent(item.id)}`, {
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
    () => [
      ...(curator.state.items.length
        ? [
            {
              id: "ai",
              title: "Picked for you",
              description: curator.state.prompt,
              items: curator.state.items,
            },
          ]
        : []),
      ...aiRails.sections,
      ...catalog.catalogue.sections,
    ],
    [aiRails.sections, catalog.catalogue, curator.state.items, curator.state.prompt],
  );

  async function saveTitle(item: MediaTitle) {
    const saved = await profile.saveEntry(
      profile.entries[item.id] ?? {
        titleId: item.id,
        status: "watchlist",
        rating: null,
        thoughts: "",
      },
    );

    if (saved) {
      void navigate("/shelf");
    }
  }

  async function askCurator(prompt: string) {
    await curator.ask(prompt);
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link to="/" className="brand">
          <MarqueeLogo />
          <span>Marquee</span>
        </Link>
        <nav aria-label="Primary navigation">
          {NAV.filter((item) => !item.private || isSignedIn).map((item) => (
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
            <a
              className="sign-in-button"
              href="/api/auth/github?returnTo=%2F"
              aria-label="Sign in with GitHub"
            >
              <span className="sign-in-icon">
                <GitHubIcon />
              </span>
              <span className="sign-in-copy">
                <strong>Sign in</strong>
                <small>with GitHub</small>
              </span>
            </a>
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
              isSignedIn={isSignedIn}
              sections={sections}
              episodes={episodes}
              providers={catalog.providers}
              selectedProviderIds={profile.selectedProviderIds}
              onAsk={askCurator}
              onClearCurator={curator.clear}
              onOpen={openTitle}
              onSelectProviders={(ids) => void profile.savePreferences(ids)}
              onShowSources={() => void navigate("/sources")}
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
              selectedProviderIds={profile.selectedProviderIds}
              onSelectProviders={(ids) => void profile.savePreferences(ids)}
            />
          }
        />

        {Object.entries(BROWSE_PRESETS).map(([path, preset]) => (
          <Route
            key={path}
            path={path}
            element={
              <BrowsePage preset={preset} providers={catalog.providers} onOpen={openTitle} />
            }
          />
        ))}

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {titleMatch?.params.titleId && (
        <TitleOverlay
          titleId={titleMatch.params.titleId}
          titlesById={catalog.titlesById}
          searchItems={search.items}
          canSave={isSignedIn}
          entries={profile.entries}
          watchmodeEnabled={catalog.providerSources.includes("Watchmode")}
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
        <p>Data by TMDB · Availability by Watchmode and JustWatch</p>
        <span>Made for movie night</span>
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
        <a className="hero-play" href="/api/auth/github?returnTo=%2Fshelf">
          Sign in with GitHub
        </a>
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
      <div className="search-empty">
        <h2>Nothing here.</h2>
        <p>The page you asked for is not part of Marquee.</p>
        <Link className="hero-play" to="/">
          Back to tonight
        </Link>
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
  watchmodeEnabled,
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
  watchmodeEnabled: boolean;
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

  if (isLoading || !title) {
    return null;
  }

  return (
    <DetailPanel
      item={title}
      canSave={canSave}
      entry={entries[title.id]}
      watchmodeEnabled={watchmodeEnabled}
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
