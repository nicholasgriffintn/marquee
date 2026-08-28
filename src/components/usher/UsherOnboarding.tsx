import { useState } from "react";

import type { Provider } from "../../domain/catalog";
import type { UsherMoment } from "../../domain/usher";
import { classNames } from "../../lib/class-names";
import { Heading, Text } from "../../ui";
import { UsherAnswer } from "./UsherAnswer";
import { UsherMark } from "./UsherMark";

import styles from "./UsherOnboarding.module.css";

const SIGN = [".", "T", ".", "O", ".", "N", ".", "I", ".", "G", ".", "H", ".", "T", "."];

export function UsherOnboarding({
  moment,
  providers,
  onAnswer,
  onSkip,
  onDismiss,
}: {
  moment: UsherMoment;
  providers: Provider[];
  onAnswer: (questionId: string, value: unknown) => Promise<unknown>;
  onSkip: (questionId: string) => void;
  onDismiss: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const step = moment.step ?? 1;
  const total = moment.total ?? 6;
  const questionId = moment.question?.id ?? "";

  async function submit(value: unknown) {
    setIsSaving(true);
    await onAnswer(questionId, value);
    setIsSaving(false);
  }

  return (
    <section className={styles.onboarding}>
      <div className={styles.bulbs} aria-hidden="true">
        {SIGN.map((glyph, index) =>
          glyph === "." ? (
            // oxlint-disable-next-line react/no-array-index-key -- SIGN is a fixed static glyph array, never reordered
            <i key={`bulb-${index}-${glyph}`} />
          ) : (
            <span
              // oxlint-disable-next-line react/no-array-index-key -- SIGN is a fixed static glyph array, never reordered
              key={`bulb-${index}-${glyph}`}
              className={classNames(styles.letter, index === 9 && styles.letterDim)}
            >
              {glyph}
            </span>
          ),
        )}
      </div>

      <div className={styles.inner}>
        <div className={styles.figure} aria-hidden="true">
          <UsherMark face={moment.face} />
        </div>

        <div className={classNames(styles.body, isSaving && styles.saving)}>
          <div className={styles.progress}>
            <UsherMark face={moment.face} crop="head" className={styles.progressMark} />
            <span className={styles.progressName}>The Usher</span>
            <div className={styles.progressBar}>
              <i style={{ width: `${Math.round((step / total) * 100)}%` }} />
            </div>
            <small className={styles.progressCount}>
              {step} of {total}
            </small>
          </div>

          <div className={styles.step} key={moment.id}>
            {step === 1 && (
              <Text family="serif" italic tone="muted" className={styles.greeting}>
                Evening. Two minutes and I&apos;ll know you.
              </Text>
            )}

            <Heading level={1} size="heading" family="serif" className={styles.question}>
              {moment.line}
            </Heading>
            {moment.question?.hint && (
              <Text size="sm" tone="muted" className={styles.hint}>
                {moment.question.hint}
              </Text>
            )}

            {moment.question && (
              <UsherAnswer
                question={moment.question}
                isSaving={isSaving}
                providers={providers}
                size="lg"
                onSubmit={(value) => void submit(value)}
              />
            )}
          </div>

          <div className={styles.foot}>
            <button type="button" disabled={isSaving} onClick={() => onSkip(questionId)}>
              Skip this one
            </button>
            <button type="button" disabled={isSaving} onClick={onDismiss}>
              Leave me to it
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
