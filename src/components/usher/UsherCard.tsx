import type { UsherMoment } from "../../domain/usher";
import { UsherMark } from "./UsherMark";

export function UsherCard({
  moment,
  onAction,
  onDismiss,
}: {
  moment: UsherMoment;
  onAction: (moment: UsherMoment, actionId: string) => void;
  onDismiss: (scope: "once" | "kind") => void;
}) {
  return (
    <div className="usher-card">
      <UsherMark face={moment.face} crop="head" />
      <p>{moment.line}</p>
      <div className="usher-confirm">
        {(moment.actions ?? []).map((action) => (
          <button key={action.id} type="button" onClick={() => onAction(moment, action.id)}>
            {action.label}
          </button>
        ))}
      </div>
      <button type="button" className="usher-card-mute" onClick={() => onDismiss("kind")}>
        Stop asking
      </button>
    </div>
  );
}
