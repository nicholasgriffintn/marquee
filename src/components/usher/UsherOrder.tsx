import { useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import type { Guest } from "../../domain/notebook";
import { orderPhrase, USHER_ORDER, type TonightOrder } from "../../domain/usher";
import type { OrderResult, UsherOrderState } from "../../hooks/useUsher";
import { classNames } from "../../lib/class-names";
import { mediaMeta, scoreLabel } from "../../lib/media";
import { ExternalLinkIcon, Heading, Text } from "../../ui";
import { HeroAction, HeroActions, HeroArt, HeroGradient, HeroMeta, HeroTitle } from "../hero/Hero";
import { TitleArt } from "../TitleArt";
import {
  UsherByline,
  UsherExit,
  UsherFacts,
  UsherFigure,
  UsherHero,
  UsherHeroCopy,
  UsherHeroSkeleton,
  UsherNarration,
  UsherRefusal,
} from "./UsherHeroShell";

import styles from "./UsherOrder.module.css";

function serviceLine(service: string) {
  return service ? `On ${service}.` : "Not on anything you have. Rent it, or take a backup.";
}

export function UsherOrder({
  state,
  guests,
  onSubmit,
  onOpen,
  onAnother,
  onEdit,
  onClose,
}: {
  state: UsherOrderState;
  guests: Guest[];
  onSubmit: (order: TonightOrder, guestIds: string[]) => void;
  onOpen: (item: MediaTitle) => void;
  onAnother: () => void;
  onEdit: () => void;
  onClose?: () => void;
}) {
  const [answers, setAnswers] = useState<Partial<TonightOrder>>({});
  const [reply, setReply] = useState("");
  const [seated, setSeated] = useState<string[]>([]);

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
      onSubmit(next as TonightOrder, seated);
    }
  }

  function restart() {
    setAnswers({});
    setReply("");
    setSeated([]);
    onEdit();
  }

  if (state.isWorking || pick || state.error) {
    const face = state.error ? "unimpressed" : state.isWorking ? "thinking" : "pleased";
    const heading = state.order ? orderPhrase(state.order) : "your order";

    return (
      <>
        <UsherHero empty={!pick?.item.backdropUrl}>
          {pick?.item.backdropUrl && <HeroArt item={pick.item} />}
          <HeroGradient />
          {onClose && <UsherExit onClick={onClose} />}
          <UsherFigure face={face} />

          <UsherHeroCopy>
            <UsherByline face={face} note={state.isWorking ? "checking the racks" : heading} />

            {state.error ? (
              <UsherRefusal heading="Nothing doing.">
                {state.error}
                <HeroActions className={styles.errorActions}>
                  <HeroAction variant="outline" onClick={restart}>
                    Change my answers
                  </HeroAction>
                </HeroActions>
              </UsherRefusal>
            ) : pick ? (
              <>
                <HeroTitle title={pick.item.title} />
                <HeroMeta>
                  {mediaMeta(pick.item)} · {scoreLabel(pick.item)}
                </HeroMeta>
                <UsherNarration>{pick.line}</UsherNarration>
                <p className={styles.service}>{serviceLine(pick.service)}</p>
                <UsherFacts facts={pick.facts} />
                <HeroActions>
                  <HeroAction
                    variant="primary"
                    icon={<ExternalLinkIcon />}
                    onClick={() => onOpen(pick.item)}
                  >
                    See where to watch
                  </HeroAction>
                  <HeroAction variant="outline" onClick={onAnother}>
                    Something else
                  </HeroAction>
                  <HeroAction variant="quiet" onClick={restart}>
                    Change my answers
                  </HeroAction>
                </HeroActions>
              </>
            ) : (
              <UsherHeroSkeleton lines={2} />
            )}
          </UsherHeroCopy>
        </UsherHero>

        {state.backups.length > 0 && (
          <div className={styles.backups}>
            <p className={styles.backupsHead}>
              <span>If you don&apos;t fancy it</span>
              <em>Both checked. Both fine.</em>
            </p>
            <div className={styles.backupsList}>
              {state.backups.map((backup: OrderResult) => (
                <button
                  key={backup.item.id}
                  type="button"
                  className={styles.backup}
                  onClick={() => onOpen(backup.item)}
                >
                  <span className={styles.backupArt}>
                    <TitleArt
                      url={backup.item.posterUrl}
                      seed={backup.item.id}
                      label={backup.item.title}
                      width={160}
                    />
                  </span>
                  <span className={styles.backupCopy}>
                    <strong>{backup.item.title}</strong>
                    <small>{mediaMeta(backup.item)}</small>
                    <em>{backup.line}</em>
                    <span className={styles.backupService}>{serviceLine(backup.service)}</span>
                    <UsherFacts facts={backup.facts} />
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
    <UsherHero empty>
      <HeroGradient />
      {onClose && <UsherExit onClick={onClose} />}
      <UsherFigure face="idle" />

      <UsherHeroCopy>
        <UsherByline face="idle" note="taking your order" />

        <div className={styles.pad} key={step?.id ?? "done"}>
          <p className={styles.count}>
            {index + 1} of {USHER_ORDER.length}
          </p>
          {reply ? <p className={styles.reply}>{reply}</p> : null}
          <Heading level={1} size="heading" family="serif" className={styles.question}>
            {step?.line}
          </Heading>
          <Text size="sm" tone="muted" className={styles.hint}>
            {step?.hint}
          </Text>

          <div className={styles.options}>
            {(step?.options ?? []).map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.option}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {step?.id === "company" && guests.length > 0 && (
            <div className={styles.seats}>
              <span className={styles.seatsLabel}>Anyone I know?</span>
              <div className={styles.seatsRow}>
                {guests.map((guest) => {
                  const isSeated = seated.includes(guest.id);

                  return (
                    <button
                      key={guest.id}
                      type="button"
                      className={classNames(styles.seat, isSeated && styles.seated)}
                      aria-pressed={isSeated}
                      title={guest.vetoes.length ? `No ${guest.vetoes.join(", ")}` : undefined}
                      onClick={() =>
                        setSeated((current) =>
                          current.includes(guest.id)
                            ? current.filter((id) => id !== guest.id)
                            : [...current, guest.id],
                        )
                      }
                    >
                      {guest.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className={styles.ticket} aria-hidden="true">
          {USHER_ORDER.map((entry) => (
            <span key={entry.id} className={answers[entry.id] ? styles.ticketFilled : undefined}>
              {entry.options.find((option) => option.value === answers[entry.id])?.label ?? "—"}
            </span>
          ))}
        </p>
      </UsherHeroCopy>
    </UsherHero>
  );
}
