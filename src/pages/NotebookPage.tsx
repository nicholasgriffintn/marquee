import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { AlertSettings } from "../components/notebook/AlertSettings";
import { BeliefList } from "../components/notebook/BeliefList";
import { ConnectionsPanel } from "../components/notebook/ConnectionsPanel";
import { FeedPanel } from "../components/notebook/FeedPanel";
import { GuestList } from "../components/notebook/GuestList";
import { ImportPanel } from "../components/notebook/ImportPanel";
import { NotebookIndex } from "../components/notebook/NotebookIndex";
import {
  NotebookAside,
  NotebookEmpty,
  NotebookSection,
  NotebookSubheading,
} from "../components/notebook/NotebookSection";
import { PreferencesPanel } from "../components/notebook/PreferencesPanel";
import { ServicesPanel } from "../components/notebook/ServicesPanel";
import { TasteMap } from "../components/notebook/TasteMap";
import { UsherMark } from "../components/usher/UsherMark";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import { NOTEBOOK_DIVIDERS, type Belief, type Guest } from "../domain/notebook";
import { useNotebookDivider } from "../hooks/useNotebookDivider";
import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";
import { Eyebrow, Heading, Page, Text } from "../ui";

import styles from "./NotebookPage.module.css";

type NotebookResponse = { beliefs: Belief[] };

type GuestResponse = { guests: Guest[] };

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
  const current = useNotebookDivider();

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let active = true;

    async function load() {
      try {
        const response = await queryJson<NotebookResponse>("/api/notebook");

        if (active) {
          setBeliefs(response.beliefs);
          setError("");
        }
      } catch {
        if (active) {
          setBeliefs([]);
          setError("The notebook is out of reach for a moment. Try again shortly.");
        }
      }
    }

    void load();
    void queryJson<GuestResponse>("/api/notebook/guests")
      .then((response) => {
        if (active) {
          setGuests(response.guests);
        }

        return response;
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- reloads is a deliberate refetch trigger, not read in the body
  }, [isSignedIn, reloads]);

  async function actOnBelief(belief: Belief, body: Record<string, unknown>) {
    setBusy(belief.id);

    try {
      await mutateJson(`/api/notebook/${belief.id}`, jsonMutation("PATCH", body));
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
      const response = await mutateJson<GuestResponse>(
        "/api/notebook/guests",
        jsonMutation("POST", { name, vetoes }),
      );

      setGuests(response.guests);
    } catch {
      setError("Could not note them down.");
    }
  }

  async function dropGuest(guest: Guest) {
    try {
      const response = await mutateJson<GuestResponse>(
        `/api/notebook/guests/${guest.id}`,
        jsonMutation("DELETE"),
      );

      setGuests(response.guests);
    } catch {
      setError("Could not show them out.");
    }
  }

  if (!isSignedIn) {
    return (
      <Page>
        <div className={styles.head}>
          <UsherMark face="idle" crop="head" className={styles.mark} />
          <div>
            <Eyebrow tone="accent" tracking="wide" className={styles.eyebrow}>
              The Usher&apos;s notebook
            </Eyebrow>
            <Heading level={1} size="heading" family="serif" className={styles.title}>
              I only keep one of these per ticket.
            </Heading>
            <Text tone="muted" leading="relaxed" className={styles.lede}>
              <Link to="/sign-in?returnTo=%2Fnotebook">Come to the box office</Link> and I will
              start yours. Thirty years of other people&apos;s evenings in here already.
            </Text>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className={styles.head}>
        <UsherMark face="thinking" crop="head" className={styles.mark} />
        <div>
          <Eyebrow tone="accent" tracking="wide" className={styles.eyebrow}>
            The Usher&apos;s notebook
          </Eyebrow>
          <Heading level={1} size="heading" family="serif" className={styles.title}>
            What I have worked out about you.
          </Heading>
          <Text tone="muted" leading="relaxed" className={styles.lede}>
            Thirty years of other people&apos;s evenings in the front of this book. Your page is at
            the back. Nothing in it is a secret — correct it, set it aside for a night, or tear it
            out. I will not take it personally.
          </Text>
        </div>
      </div>

      {error && (
        <Text tone="warning" leading="relaxed" role="alert" className={styles.error}>
          {error}
        </Text>
      )}

      <div className={styles.body}>
        <NotebookIndex dividers={NOTEBOOK_DIVIDERS} current={current} />

        <div className={styles.pages}>
          <NotebookSection
            id="preferences"
            hidden={current !== "preferences"}
            title={NOTEBOOK_DIVIDERS[0].label}
            lede="Set the audio language I should look for and, if you want cinema notes, the one branch that counts as yours."
          >
            <ErrorBoundary label="These preferences">
              <PreferencesPanel isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="notes"
            hidden={current !== "notes"}
            title={NOTEBOOK_DIVIDERS[1].label}
            lede="Every line here came from something you did, or something you told me. Where I am guessing, I say so."
          >
            <ErrorBoundary label="These notes">
              {beliefs === null ? (
                <NotebookEmpty>Finding my glasses…</NotebookEmpty>
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
            hidden={current !== "shape"}
            title={NOTEBOOK_DIVIDERS[2].label}
            lede="Everything you have marked, placed by what it is rather than what it is called. Close together means alike. The two directions are mine rather than the industry's — where one end has a character to it, I have written it in the margin."
          >
            <ErrorBoundary label="This map">
              <TasteMap isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="services"
            hidden={current !== "services"}
            title={NOTEBOOK_DIVIDERS[3].label}
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
            hidden={current !== "room"}
            title={NOTEBOOK_DIVIDERS[4].label}
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
            hidden={current !== "post"}
            title={NOTEBOOK_DIVIDERS[5].label}
            lede="Only about things already on your shelf, never more than a handful a week, and never twice about the same thing."
          >
            <ErrorBoundary label="These settings">
              <AlertSettings isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>

          <NotebookSection
            id="elsewhere"
            hidden={current !== "elsewhere"}
            title={NOTEBOOK_DIVIDERS[6].label}
            lede="Bring your history in from somewhere else, or hand a key to something that is not a person."
          >
            <NotebookSubheading>What you brought with you</NotebookSubheading>
            <NotebookAside>
              Bring over an IMDb export, a Letterboxd ZIP, a linked Trakt account, or a portable
              JSON or CSV file. You will preview uncertain titles before anything changes.
            </NotebookAside>
            <ErrorBoundary label="The import">
              <ImportPanel
                isSignedIn={isSignedIn}
                onImported={() => setReloads((count) => count + 1)}
              />
            </ErrorBoundary>

            <NotebookSubheading>Accounts and keys</NotebookSubheading>
            <ErrorBoundary label="These connections">
              <ConnectionsPanel isSignedIn={isSignedIn} />
            </ErrorBoundary>

            <NotebookSubheading>Somewhere other than here</NotebookSubheading>
            <NotebookAside>
              What is coming goes in your calendar, and what I would have written to you about goes
              in your reader. Both are yours alone, both are links rather than accounts, and either
              can be taken back.
            </NotebookAside>
            <ErrorBoundary label="These subscriptions">
              <FeedPanel isSignedIn={isSignedIn} />
            </ErrorBoundary>
          </NotebookSection>
        </div>
      </div>
    </Page>
  );
}
