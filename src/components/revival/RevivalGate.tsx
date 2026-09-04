import { Button, ButtonLink, EmptyState } from "../../ui";
import { UsherMark } from "../usher/UsherMark";

import styles from "./RevivalGate.module.css";

export function RevivalGate({ onAccept }: { onAccept: () => void }) {
  return (
    <EmptyState
      className={styles.gate}
      mark={<UsherMark face="thinking" crop="head" className={styles.mark} />}
      heading="Before you go through."
      description="The revival house shows prints as they were made. Some are a century old and carry the attitudes of their day, some are propaganda kept for the record, and a few say on their own page exactly what is in them. Nothing is cut and nothing is softened. Go in knowing that, and knowing that what plays is your choice."
      actions={
        <>
          <Button variant="primary" size="lg" onClick={onAccept}>
            I understand. Let me in.
          </Button>
          <ButtonLink to="/" variant="secondary" size="lg">
            Not tonight
          </ButtonLink>
        </>
      }
    />
  );
}
