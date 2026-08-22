import { useState } from "react";

import type { Provider } from "../../domain/catalog";
import type { UsherMoment } from "../../domain/usher";
import { UsherAnswer } from "./UsherAnswer";
import { UsherMark } from "./UsherMark";

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
    <aside className="usher-banner" aria-label="The Usher">
      <UsherMark face={moment.face} crop="head" />
      <div className="usher-banner-body">
        <p className="usher-banner-line">{moment.line}</p>
        {moment.question ? (
          <UsherAnswer
            question={moment.question}
            isSaving={isSaving}
            providers={providers}
            onSubmit={(value) => void submit(value)}
          />
        ) : (
          <div className="usher-confirm">
            {(moment.actions ?? []).map((action) => (
              <button
                key={action.id}
                type="button"
                className={action.id === "dismiss" ? "" : "usher-primary"}
                onClick={() => onAction(moment, action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="usher-banner-foot">
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
