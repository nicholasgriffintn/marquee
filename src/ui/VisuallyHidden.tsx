import type { ReactNode } from "react";

import styles from "./VisuallyHidden.module.css";

export function VisuallyHidden({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className={styles.root}>
      {children}
    </span>
  );
}
