import type { UsherMoment } from "../../domain/usher";
import { Button, Cluster, Text } from "../../ui";
import { UsherMark } from "./UsherMark";

import styles from "./UsherCard.module.css";

export function UsherCard({
  moment,
  onAction,
  onDismiss,
}: {
  moment: UsherMoment;
  onAction: (moment: UsherMoment, actionId: string) => void;
  onDismiss: (scope: "once" | "kind") => void;
}) {
  const actions = moment.actions ?? [];

  return (
    <div className={styles.card}>
      <UsherMark face={moment.face} crop="head" className={styles.mark} />
      <Text family="serif" className={styles.line}>
        {moment.line}
      </Text>
      <Cluster gap={2}>
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={actions.length === 1 ? "primary" : "secondary"}
            size="md"
            onClick={() => onAction(moment, action.id)}
          >
            {action.label}
          </Button>
        ))}
      </Cluster>
      <button type="button" className={styles.mute} onClick={() => onDismiss("kind")}>
        Stop asking
      </button>
    </div>
  );
}
