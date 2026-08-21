import { useCallback, useMemo, useState } from "react";

import { DetailPanel } from "./components/catalog";
import { GitHubIcon, MarqueeLogo } from "./components/ui";
import type { MediaTitle } from "./domain/catalog";
import { useCatalog } from "./hooks/useCatalog";
import { useCurator } from "./hooks/useCurator";
import { useProfile } from "./hooks/useProfile";
import { useSession } from "./hooks/useSession";
import { LibraryPage } from "./pages/LibraryPage";
import { SourcesPage } from "./pages/SourcesPage";
import { TonightPage } from "./pages/TonightPage";
import type { View } from "./types";

export function App() {
  const [view, setView] = useState<View>("tonight");
  const [selected, setSelected] = useState<MediaTitle | null>(null);
  const [query, setQuery] = useState("");
  const session = useSession();
  const isSignedIn = Boolean(session.user);
  const profile = useProfile(isSignedIn);
  const catalog = useCatalog(query, profile.selectedProviderIds, profile.savedIds);
  const curator = useCurator();
  const closeDetails = useCallback(() => setSelected(null), []);

  const activeView = !isSignedIn && view === "library" ? "tonight" : view;
  const sections = useMemo(() => {
    if (!curator.curator) {
      return catalog.catalogue.sections;
    }

    return [
      {
        id: "ai",
        title: "Picked for you",
        description: curator.curator.summary,
        items: curator.curator.items,
      },
      ...catalog.catalogue.sections,
    ];
  }, [catalog.catalogue, curator.curator]);

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
      setSelected(null);
      setView("library");
    }
  }

  async function askCurator(prompt: string) {
    await curator.ask(prompt);
  }

  return (
    <main className="site-shell">
      <header className="site-header">
        <button type="button" className="brand" onClick={() => setView("tonight")}>
          <MarqueeLogo />
          <span>Marquee</span>
        </button>
        <nav aria-label="Primary navigation">
          <button
            className={activeView === "tonight" ? "active" : ""}
            onClick={() => setView("tonight")}
          >
            Tonight
          </button>
          {isSignedIn && (
            <button
              className={activeView === "library" ? "active" : ""}
              onClick={() => setView("library")}
            >
              My shelf <sup>{profile.savedIds.length}</sup>
            </button>
          )}
          <button
            className={activeView === "sources" ? "active" : ""}
            onClick={() => setView("sources")}
          >
            Sources
          </button>
        </nav>
        <div className="header-tools">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setView("tonight");
                curator.clear();
              }}
              placeholder="Search"
              aria-label="Search films and television"
            />
          </label>
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

      {activeView === "tonight" && (
        <TonightPage
          curator={curator.curator}
          curatorError={curator.error}
          isAsking={curator.isAsking}
          isLoading={catalog.isLoading}
          error={catalog.error}
          providerError={catalog.providerError}
          isSignedIn={isSignedIn}
          sections={sections}
          providers={catalog.providers}
          selectedProviderIds={profile.selectedProviderIds}
          onAsk={askCurator}
          onClearCurator={curator.clear}
          onOpen={setSelected}
          onSelectProviders={(ids) => void profile.savePreferences(ids)}
          onShowSources={() => setView("sources")}
        />
      )}

      {activeView === "library" && (
        <LibraryPage
          entries={profile.entries}
          titles={catalog.savedTitles}
          catalogueError={catalog.error}
          onOpen={setSelected}
          onRemove={(id) => void profile.removeEntry(id)}
          onSave={(entry) => void profile.saveEntry(entry)}
          onShowTonight={() => setView("tonight")}
          onStatus={profile.setStatus}
          onUpdateDraft={profile.updateDraft}
        />
      )}

      {activeView === "sources" && (
        <SourcesPage
          providers={catalog.providers}
          providerError={catalog.providerError}
          stats={catalog.providerStats}
          isSignedIn={isSignedIn}
          selectedProviderIds={profile.selectedProviderIds}
          onSelectProviders={(ids) => void profile.savePreferences(ids)}
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

      {selected && (
        <DetailPanel
          item={selected}
          canSave={isSignedIn}
          isSaved={Boolean(profile.entries[selected.id])}
          watchmodeEnabled={catalog.providerSources.includes("Watchmode")}
          onClose={closeDetails}
          onSave={(item) => void saveTitle(item)}
        />
      )}
    </main>
  );
}
