import { useState } from "react";

import { sharedTraits, type MediaTitle } from "../../domain/catalog";
import { useResource } from "../../hooks/useResource";
import { useTitlePath } from "../../hooks/useTitlePath";
import { Callout, Skeleton } from "../../ui";
import { useScreeningRoom, useStageReport } from "../screening/ScreeningContext";
import { TitleArt } from "../TitleArt";
import { TitlePicker } from "./TitlePicker";

import styles from "./CorridorStop.module.css";

const SEED_FROM = "Paddington";
const SEED_TO = "Alien";
const SKELETON_HOPS = [0, 1, 2, 3];

function seedUrl(query: string) {
  return `/api/catalog/search?query=${encodeURIComponent(query)}`;
}

function closeness(score: number) {
  return `${Math.round(score * 100)}%`;
}

export function CorridorStop({
  isActive,
  onOpen,
}: {
  isActive: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const [picked, setPicked] = useState<{ from: MediaTitle | null; to: MediaTitle | null } | null>(
    null,
  );
  const report = useStageReport("corridor");
  const steer = useScreeningRoom()?.room?.steer ?? null;
  const steered = steer?.phase === "walk" && steer.from && steer.to ? steer : null;

  const seedFrom = useResource<{ items: MediaTitle[] }>(seedUrl(SEED_FROM), {
    enabled: isActive && !picked,
  });
  const seedTo = useResource<{ items: MediaTitle[] }>(seedUrl(SEED_TO), {
    enabled: isActive && !picked,
  });

  const from = steered?.from ?? (picked ? picked.from : (seedFrom.data?.items[0] ?? null));
  const to = steered?.to ?? (picked ? picked.to : (seedTo.data?.items[0] ?? null));

  function choose(end: "from" | "to", item: MediaTitle | null) {
    const next = { from, to, [end]: item };

    setPicked(next);

    if (next.from && next.to && next.from.id !== next.to.id) {
      report("walk", `${next.from.title} → ${next.to.title}`);
    }
  }

  const walk = useTitlePath(from?.id ?? "", to?.id ?? "", isActive);

  return (
    <div className={styles.corridor}>
      <div className={styles.ends}>
        <TitlePicker label="Start here" chosen={from} onChoose={(item) => choose("from", item)} />
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <TitlePicker label="End up here" chosen={to} onChoose={(item) => choose("to", item)} />
      </div>

      {walk.error && <Callout>{walk.error}</Callout>}

      {from && to && from.id === to.id && (
        <p className={styles.verdict}>
          That is the same film twice. Name me a second one and I will do the walking.
        </p>
      )}

      {walk.isLoading && walk.steps.length === 0 && (
        <div className={styles.walk} aria-hidden="true">
          {SKELETON_HOPS.map((hop) => (
            <Skeleton key={hop} className={styles.hopSkeleton} />
          ))}
        </div>
      )}

      {walk.steps.length > 0 && (
        <ol className={styles.walk}>
          {walk.steps.map((step, index) => {
            const previous = walk.steps[index - 1];
            const traits = previous ? sharedTraits(previous.title, step.title) : [];

            return (
              <li key={step.title.id} className={styles.hop}>
                {previous && (
                  <p className={styles.because}>
                    <span>{closeness(step.toEnd)} of the way there</span>
                    {traits.length > 0
                      ? `Standing on ${traits.join(", ").toLowerCase()}.`
                      : "Nothing in common on paper. The vectors disagree."}
                  </p>
                )}

                <button type="button" className={styles.step} onClick={() => onOpen(step.title)}>
                  <span className={styles.art}>
                    <TitleArt
                      url={step.title.posterUrl}
                      seed={step.title.id}
                      label={step.title.title}
                      width={160}
                    />
                  </span>
                  <span className={styles.copy}>
                    <strong>{step.title.title}</strong>
                    <small>{step.title.year ?? "—"}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {walk.steps.length > 0 && (
        <p className={styles.verdict}>
          {walk.arrived
            ? `${walk.steps.length - 1} steps, and not one of them further from the far end than the step before it.`
            : "That is as close as the neighbours get. He stops rather than pretend the last step exists."}
        </p>
      )}
    </div>
  );
}
