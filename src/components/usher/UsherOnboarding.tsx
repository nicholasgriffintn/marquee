import { useState } from "react";

import type { Provider } from "../../domain/catalog";
import type { UsherMoment } from "../../domain/usher";
import { UsherAnswer } from "./UsherAnswer";
import { UsherMark } from "./UsherMark";

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
    <section className="hero-section usher-onboarding">
      <div className="usher-bulbs" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} />
        ))}
      </div>

      <div className="usher-onboarding-inner">
        <div className="usher-onboarding-figure" aria-hidden="true">
          <UsherMark face={moment.face} className="usher-figure" />
        </div>

        <div className={`usher-onboarding-body${isSaving ? " saving" : ""}`}>
          <div className="usher-progress">
            <span>The Usher</span>
            <div className="usher-progress-bar">
              <i style={{ width: `${Math.round((step / total) * 100)}%` }} />
            </div>
            <small>
              {step} of {total}
            </small>
          </div>

          <div className="usher-step" key={moment.id}>
            {step === 1 && (
              <p className="usher-greeting">Evening. Two minutes and I'll know you.</p>
            )}

            <h1 className="usher-question">{moment.line}</h1>
            {moment.question?.hint && <p className="usher-hint">{moment.question.hint}</p>}

            {moment.question && (
              <UsherAnswer
                question={moment.question}
                isSaving={isSaving}
                providers={providers}
                onSubmit={(value) => void submit(value)}
              />
            )}
          </div>

          <div className="usher-onboarding-foot">
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
