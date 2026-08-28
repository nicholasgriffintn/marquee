import { useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import type { UsherFace } from "../../domain/usher";
import type { CuratorState } from "../../hooks/useCurator";
import type { UsherPickState } from "../../hooks/useUsher";
import { classNames } from "../../lib/class-names";
import { mediaMeta, scoreLabel } from "../../lib/media";
import { ExternalLinkIcon, Text } from "../../ui";
import {
  HeroAction,
  HeroActionLink,
  HeroActions,
  HeroArt,
  HeroGradient,
  HeroMeta,
  HeroTitle,
} from "../hero/Hero";
import { TitleArt } from "../TitleArt";
import {
  UsherByline,
  UsherCaret,
  UsherExit,
  UsherFacts,
  UsherFigure,
  UsherHero as UsherHeroShell,
  UsherHeroCopy,
  UsherHeroSkeleton,
  UsherNarration,
  UsherRefusal,
} from "./UsherHeroShell";

import styles from "./UsherHero.module.css";

const REFINEMENTS = ["Shorter", "Lighter", "Older", "Weirder", "More acclaimed"];

export function UsherHero({
  curator,
  error,
  isAsking,
  isPinned,
  pick,
  aside,
  onAsk,
  onClear,
  onOpen,
  onPin,
  onReject,
}: {
  curator: CuratorState;
  error: string;
  isAsking: boolean;
  isPinned: boolean;
  pick: UsherPickState;
  aside: string;
  onAsk: (prompt: string, isRefinement?: boolean) => void;
  onClear: () => void;
  onOpen: (item: MediaTitle) => void;
  onPin: () => void;
  onReject: (scope?: "never") => void;
}) {
  const [selection, setSelection] = useState({ prompt: "", id: "" });

  if (aside) {
    return (
      <UsherHeroShell empty>
        <HeroGradient />
        <UsherExit onClick={onClear} />
        <UsherFigure face="idle" />
        <UsherHeroCopy>
          <UsherByline face="idle" note="since you asked" />
          <Text family="serif" className={styles.asideLine}>
            {aside}
          </Text>
          <HeroActions>
            <HeroActionLink to="/usher" variant="primary">
              There is a film about it
            </HeroActionLink>
          </HeroActions>
        </UsherHeroCopy>
      </UsherHeroShell>
    );
  }

  const isPick = Boolean(pick.item || pick.isPicking || pick.error);
  const activeId = selection.prompt === curator.prompt ? selection.id : "";
  const active = isPick
    ? pick.item
    : (curator.items.find((item) => item.id === activeId) ?? curator.items[0] ?? null);
  const failure = isPick ? pick.error : error;
  const isThinking = isPick ? pick.isPicking : curator.isStreaming || isAsking;
  const face: UsherFace = failure ? "unimpressed" : isThinking ? "thinking" : "pleased";
  const line = isPick ? pick.line : curator.summary || curator.status || "Reading the room.";

  return (
    <UsherHeroShell empty={!active?.backdropUrl}>
      {active && <HeroArt item={active} />}
      <HeroGradient />

      <UsherExit onClick={onClear} />

      {isPick && <UsherFigure face={face} />}

      <UsherHeroCopy>
        <UsherByline
          face={face}
          note={
            isPick
              ? isThinking
                ? "picking something"
                : "my pick for tonight"
              : `you asked: “${curator.prompt}”`
          }
        />

        {failure ? (
          <UsherRefusal heading="No.">{failure}</UsherRefusal>
        ) : active ? (
          <>
            <HeroTitle title={active.title} />
            <HeroMeta>
              {mediaMeta(active)} · {scoreLabel(active)}
            </HeroMeta>
            <UsherNarration>
              {line}
              {curator.isStreaming && !isPick && <UsherCaret />}
            </UsherNarration>
            {isPick && <UsherFacts facts={pick.facts} />}
            <HeroActions>
              <HeroAction
                variant="primary"
                icon={<ExternalLinkIcon />}
                onClick={() => onOpen(active)}
              >
                See where to watch
              </HeroAction>
              {isPick ? (
                <>
                  <HeroAction variant="outline" disabled={isThinking} onClick={() => onReject()}>
                    Not that
                  </HeroAction>
                  <HeroAction
                    variant="quiet"
                    disabled={isThinking}
                    onClick={() => onReject("never")}
                  >
                    Never suggest this again
                  </HeroAction>
                </>
              ) : (
                curator.items.length > 1 && (
                  <HeroAction
                    variant="outline"
                    disabled={isPinned || curator.isStreaming}
                    onClick={onPin}
                  >
                    {isPinned ? "Pinned" : "Pin this shelf"}
                  </HeroAction>
                )
              )}
            </HeroActions>
          </>
        ) : (
          <UsherHeroSkeleton />
        )}

        {!isPick && curator.items.length > 1 && (
          <div className={styles.strip} aria-label="The rest of the selection">
            {curator.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={classNames(styles.stripItem, item.id === active?.id && styles.stripOn)}
                aria-current={item.id === active?.id}
                onClick={() => setSelection({ prompt: curator.prompt, id: item.id })}
              >
                <TitleArt
                  url={item.posterUrl}
                  seed={item.id}
                  label={item.title}
                  width={160}
                  alt={item.title}
                />
              </button>
            ))}
          </div>
        )}

        {!isPick && curator.items.length > 0 && !curator.isStreaming && (
          <div className={styles.refine}>
            <span className={styles.refineLabel}>Refine</span>
            {REFINEMENTS.map((refinement) => (
              <button
                key={refinement}
                type="button"
                className={styles.refineButton}
                disabled={isAsking}
                onClick={() => onAsk(refinement, true)}
              >
                {refinement}
              </button>
            ))}
          </div>
        )}
      </UsherHeroCopy>
    </UsherHeroShell>
  );
}
