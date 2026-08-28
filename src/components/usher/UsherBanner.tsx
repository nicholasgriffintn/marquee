import { useState } from "react";

import type { Provider } from "../../domain/catalog";
import type { UsherMoment } from "../../domain/usher";
import { Button, Cluster, Text } from "../../ui";
import { UsherAnswer } from "./UsherAnswer";
import { UsherMark } from "./UsherMark";

import styles from "./UsherBanner.module.css";

export function UsherBanner({
  moment,
  providers,
  onAnswer,
  onSkip,
  onAction,
  onDismiss,
}: {
  moment: UsherMoment;
  providers: Provider[];
  onAnswer: (questionId: string, value: unknown) => Promise<unknown>;
  onSkip: (questionId: string) => void;
  onAction: (moment: UsherMoment, actionId: string) => void;
  onDismiss: (scope: "once" | "kind") => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const questionId = moment.question?.id ?? "";

  async function submit(value: unknown) {
    setIsSaving(true);
    await onAnswer(questionId, value);
    setIsSaving(false);
  }

  return (
    <aside className={styles.banner} aria-label="The Usher">
      <UsherMark face={moment.face} crop="head" className={styles.mark} />
      <div className={styles.body}>
        <Text family="serif" className={styles.line}>
          {moment.line}
        </Text>
        {moment.question ? (
          <UsherAnswer
            question={moment.question}
            isSaving={isSaving}
            providers={providers}
            onSubmit={(value) => void submit(value)}
          />
        ) : (
          <Cluster gap={2}>
            {(moment.actions ?? []).map((action) => (
              <Button
                key={action.id}
                variant={action.id === "dismiss" ? "secondary" : "primary"}
                size="md"
                onClick={() => onAction(moment, action.id)}
              >
                {action.label}
              </Button>
            ))}
          </Cluster>
        )}
      </div>
      <div className={styles.foot}>
        {moment.question && (
          <button type="button" onClick={() => onSkip(questionId)}>
            Skip
          </button>
        )}
        <button type="button" onClick={() => onDismiss("kind")}>
          Stop asking
        </button>
      </div>
    </aside>
  );
}
