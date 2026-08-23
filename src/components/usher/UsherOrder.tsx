import { useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import { orderPhrase, USHER_ORDER, type TonightOrder } from "../../domain/usher";
import type { OrderResult, UsherOrderState } from "../../hooks/useUsher";
import { artwork, artworkSrcSet, heroTitleClass, mediaMeta, scoreLabel } from "../../lib/media";
import { ArtPlaceholder } from "../ArtPlaceholder";
import { UsherMark } from "./UsherMark";

function serviceLine(service: string) {
  return service ? `On ${service}.` : "Not on anything you have. Rent it, or take a backup.";
}

export function UsherOrder({
  state,
  onSubmit,
  onOpen,
  onAnother,
  onEdit,
  onClose,
}: {
  state: UsherOrderState;
  onSubmit: (order: TonightOrder) => void;
  onOpen: (item: MediaTitle) => void;
  onAnother: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Partial<TonightOrder>>({});
  const [reply, setReply] = useState("");

  const index = USHER_ORDER.findIndex((step) => !answers[step.id]);
  const step = USHER_ORDER[index];
  const pick = state.pick;

  function choose(value: string) {
    if (!step) {
      return;
    }

    const next = { ...answers, [step.id]: value };
    const hint = step.options.find((option) => option.value === value)?.hint ?? "";

    setAnswers(next);
    setReply(hint);

    if (USHER_ORDER.every((entry) => next[entry.id])) {
      onSubmit(next as TonightOrder);
    }
  }

  function restart() {
    setAnswers({});
    setReply("");
    onEdit();
  }

  if (state.isWorking || pick || state.error) {
    const face = state.error ? "unimpressed" : state.isWorking ? "thinking" : "pleased";
    const heading = state.order ? orderPhrase(state.order) : "your order";

    return (
      <>
        <section
          className={`hero-section usher-hero usher-hero-pick usher-order-result${
            pick?.item.backdropUrl ? "" : " hero-empty"
          }`}
        >
          {pick?.item.backdropUrl && (
            <div className="hero-art" aria-hidden="true">
              <img
                src={artwork(pick.item.backdropUrl, 1280, "backdrop") ?? pick.item.backdropUrl}
                srcSet={artworkSrcSet(pick.item.backdropUrl, 1280, "backdrop")}
                alt=""
                decoding="async"
              />
            </div>
          )}
          <div className="hero-gradient" />

          <button type="button" className="usher-exit" onClick={onClose}>
            ← Back to tonight
          </button>

          <div className="usher-hero-figure" aria-hidden="true">
            <UsherMark face={face} className="usher-figure" />
          </div>

          <div className="hero-copy">
            <div className="usher-hero-head">
              <UsherMark face={face} crop="head" />
              <p>
                <span>The Usher</span>
                <em>{state.isWorking ? "checking the racks" : heading}</em>
              </p>
            </div>

            {state.error ? (
              <div className="honest-empty" aria-live="polite">
                <h1>Nothing doing.</h1>
                <p>{state.error}</p>
                <div className="hero-actions">
                  <button type="button" className="usher-pin" onClick={restart}>
                    Change my answers
                  </button>
                </div>
              </div>
            ) : pick ? (
              <>
                <h1 className={heroTitleClass(pick.item.title)}>{pick.item.title}</h1>
                <p className="hero-meta">
                  {mediaMeta(pick.item)} · {scoreLabel(pick.item)}
                </p>
                <p className="usher-narration" aria-live="polite">
                  {pick.line}
                </p>
                <p className="usher-order-service">{serviceLine(pick.service)}</p>
                <div className="hero-actions">
                  <button type="button" className="hero-play" onClick={() => onOpen(pick.item)}>
                    <span className="play-icon">↗</span> See where to watch
                  </button>
                  <button type="button" className="usher-pin" onClick={onAnother}>
                    Something else
                  </button>
                  <button type="button" className="usher-quiet" onClick={restart}>
                    Change my answers
                  </button>
                </div>
              </>
            ) : (
              <div className="hero-skeleton" aria-hidden="true">
                <span className="skeleton skeleton-title" />
                <span className="skeleton skeleton-meta" />
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line short" />
              </div>
            )}
          </div>
        </section>

        {state.backups.length > 0 && (
          <div className="usher-backups">
            <p className="usher-backups-head">
              <span>If you don't fancy it</span>
              <em>Both checked. Both fine.</em>
            </p>
            <div className="usher-backups-list">
              {state.backups.map((backup: OrderResult) => (
                <button
                  key={backup.item.id}
                  type="button"
                  className="usher-backup"
                  onClick={() => onOpen(backup.item)}
                >
                  <span className="usher-backup-art">
                    {backup.item.posterUrl ? (
                      <img
                        src={artwork(backup.item.posterUrl, 160) ?? backup.item.posterUrl}
                        srcSet={artworkSrcSet(backup.item.posterUrl, 160)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <ArtPlaceholder seed={backup.item.id} label={backup.item.title} />
                    )}
                  </span>
                  <span className="usher-backup-copy">
                    <strong>{backup.item.title}</strong>
                    <small>{mediaMeta(backup.item)}</small>
                    <em>{backup.line}</em>
                    <span className="usher-backup-service">{serviceLine(backup.service)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="hero-section usher-hero usher-order-pad hero-empty">
      <div className="hero-gradient" />

      <button type="button" className="usher-exit" onClick={onClose}>
        ← Back to tonight
      </button>

      <div className="usher-hero-figure" aria-hidden="true">
        <UsherMark face="idle" className="usher-figure" />
      </div>

      <div className="hero-copy">
        <div className="usher-hero-head">
          <UsherMark face="idle" crop="head" />
          <p>
            <span>The Usher</span>
            <em>taking your order</em>
          </p>
        </div>

        <div className="usher-order-pad-inner" key={step?.id ?? "done"}>
          <p className="usher-order-count">
            {index + 1} of {USHER_ORDER.length}
          </p>
          {reply ? <p className="usher-order-reply">{reply}</p> : null}
          <h1 className="usher-question">{step?.line}</h1>
          <p className="usher-hint">{step?.hint}</p>

          <div className="usher-options usher-options-wrap">
            {(step?.options ?? []).map((option) => (
              <button key={option.value} type="button" onClick={() => choose(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <p className="usher-order-ticket" aria-hidden="true">
          {USHER_ORDER.map((entry) => (
            <span key={entry.id} className={answers[entry.id] ? "filled" : ""}>
              {entry.options.find((option) => option.value === answers[entry.id])?.label ?? "—"}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
