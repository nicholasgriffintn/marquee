import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { AlertSettings } from "../components/notebook/AlertSettings";
import { BeliefList } from "../components/notebook/BeliefList";
import { ConnectionsPanel } from "../components/notebook/ConnectionsPanel";
import { GuestList } from "../components/notebook/GuestList";
import { ImportPanel } from "../components/notebook/ImportPanel";
import { NotebookIndex, type Divider } from "../components/notebook/NotebookIndex";
import { NotebookSection } from "../components/notebook/NotebookSection";
import { ServicesPanel } from "../components/notebook/ServicesPanel";
import { TasteMap } from "../components/notebook/TasteMap";
import { UsherMark } from "../components/usher/UsherMark";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import type { Belief, Guest } from "../domain/notebook";
import { jsonRequest, requestJson } from "../lib/api";

type NotebookResponse = { beliefs: Belief[] };

type GuestResponse = { guests: Guest[] };

const DIVIDERS: Divider[] = [
  { id: "notes", label: "What I have written down", aside: "and what you have crossed out" },
  { id: "shape", label: "The shape of it", aside: "your shelf, laid out flat" },
  { id: "services", label: "Where you watch", aside: "and what you are paying for" },
  { id: "room", label: "Who sits with you", aside: "and what they will not sit through" },
  { id: "post", label: "When I should write", aside: "sparingly, and never twice" },
  { id: "elsewhere", label: "Elsewhere you have an account", aside: "keys to other houses" },
];

export function NotebookPage({
  isSignedIn,
  providers,
  providerError,
  providerStats,
  selectedProviderIds,
  onSelectProviders,
}: {
  isSignedIn: boolean;
  providers: Provider[];
  providerError: string;
  providerStats: ProvidersResponse["stats"];
  selectedProviderIds: string[];
  onSelectProviders: (ids: string[]) => void;
}) {
  const [beliefs, setBeliefs] = useState<Belief[] | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<NotebookResponse>("/api/notebook", {
          signal: controller.signal,
        });

        setBeliefs(response.beliefs);
        setError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setBeliefs([]);
        setError("The notebook is out of reach for a moment. Try again shortly.");
      }
    }

    void load();
    void requestJson<GuestResponse>("/api/notebook/guests", { signal: controller.signal })
      .then((response) => setGuests(response.guests))
      .catch(() => undefined);

    return () => controller.abort();
  }, [isSignedIn, reloads]);

  async function actOnBelief(belief: Belief, body: Record<string, unknown>) {
    setBusy(belief.id);

    try {
      await requestJson(`/api/notebook/${belief.id}`, jsonRequest("PATCH", body));
      setReloads((count) => count + 1);
    } catch {
      setError("That did not take. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function saveGuest(name: string, vetoes: string[]) {
    if (!name) {
      return;
    }

    try {
      const response = await requestJson<GuestResponse>(
        "/api/notebook/guests",
        jsonRequest("POST", { name, vetoes }),
      );

      setGuests(response.guests);
    } catch {
      setError("Could not note them down.");
    }
  }

  async function dropGuest(guest: Guest) {
    try {
      const response = await requestJson<GuestResponse>(
        `/api/notebook/guests/${guest.id}`,
        jsonRequest("DELETE"),
      );

      setGuests(response.guests);
    } catch {
      setError("Could not show them out.");
    }
  }

  if (!isSignedIn) {
    return (
      <section className="page-section notebook">
        <div className="notebook-head">
          <UsherMark face="idle" crop="head" className="notebook-mark" />
          <div>
            <p className="page-eyebrow">The Usher's notebook</p>
            <h1>I only keep one of these per ticket.</h1>
            <p className="notebook-lede">
              <Link to="/sign-in?returnTo=%2Fnotebook">Come to the box office</Link> and I will
              start yours. Thirty years of other people's evenings in here already.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section notebook">
      <div className="notebook-head">
        <UsherMark face="thinking" crop="head" className="notebook-mark" />
        <div>
          <p className="page-eyebrow">The Usher's notebook</p>
          <h1>What I have worked out about you.</h1>
          <p className="notebook-lede">
            Thirty years of other people's evenings in the front of this book. Your page is at the
            back. Nothing in it is a secret — correct it, set it aside for a night, or tear it out.
            I will not take it personally.
          </p>
        </div>
      </div>

      {error && (
        <p className="notebook-error" role="alert">
          {error}
        </p>
      )}

      <div className="notebook-body">
        <NotebookIndex dividers={DIVIDERS} />

        <div className="notebook-pages">
          <NotebookSection
            id="notes"
            number={1}
            title={DIVIDERS[0].label}
            lede="Every line here came from something you did, or something you told me. Where I am guessing, I say so."
          >
            <ErrorBoundary label="These notes">
              {beliefs === null ? (
                <p className="notebook-empty">Finding my glasses…</p>
              ) : (
                <BeliefList
                  beliefs={beliefs}
                  busy={busy}
                  onAct={(b, body) => void actOnBelief(b, body)}
                />
              )}
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="shape"
            number={2}
            title={DIVIDERS[1].label}
            lede="Everything you have marked, placed by what it is rather than what it is called. Close together means alike. The two directions are mine rather than the industry's — where one end has a character to it, I have written it in the margin."
          >
            <ErrorBoundary label="This map">
              <TasteMap isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="services"
            number={3}
            title={DIVIDERS[2].label}
            lede="Tick the ones you actually pay for. I will stop offering you things behind doors you cannot open."
          >
            <ErrorBoundary label="This list of services">
              <ServicesPanel
                providers={providers}
                providerError={providerError}
                stats={providerStats}
                selectedProviderIds={selectedProviderIds}
                onSelectProviders={onSelectProviders}
              />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="room"
            number={4}
            title={DIVIDERS[3].label}
            lede="Give me a name and what they will not sit through, and I will keep it in mind when the room is not just you."
          >
            <ErrorBoundary label="This guest list">
              <GuestList
                guests={guests}
                onSave={(name, vetoes) => void saveGuest(name, vetoes)}
                onRemove={(guest) => void dropGuest(guest)}
              />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="post"
            number={5}
            title={DIVIDERS[4].label}
            lede="Only about things already on your shelf, never more than a handful a week, and never twice about the same thing."
          >
            <ErrorBoundary label="These settings">
              <AlertSettings isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="elsewhere"
            number={6}
            title={DIVIDERS[5].label}
            lede="Bring your history in from somewhere else, or hand a key to something that is not a person."
          >
            <h3>What you brought with you</h3>
            <p className="notebook-aside">
              Letterboxd will give you your whole account under Settings, Data, Export. Hand me
              diary.csv or ratings.csv and I will fill in what I have missed.
            </p>
            <ErrorBoundary label="The import">
              <ImportPanel onImported={() => setReloads((count) => count + 1)} />
            </ErrorBoundary>

            <h3>Accounts and keys</h3>
            <ErrorBoundary label="These connections">
              <ConnectionsPanel isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>
        </div>
      </div>
    </section>
  );
}
