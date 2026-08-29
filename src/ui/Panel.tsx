import { useId, type ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Heading } from "./Heading";

import styles from "./Panel.module.css";

export function Panel({
  heading,
  actions,
  rule = "top",
  tone = "accent",
  className,
  bodyClassName,
  children,
}: {
  heading?: ReactNode;
  actions?: ReactNode;
  rule?: "top" | "bottom" | "none";
  tone?: "accent" | "muted";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={heading ? headingId : undefined}
      className={classNames(styles.panel, rule === "top" && styles.ruleTop, className)}
    >
      {heading && (
        <header className={classNames(styles.head, rule === "bottom" && styles.headRule)}>
          <Heading
            level={2}
            size="label"
            id={headingId}
            tone={tone === "accent" ? "accent" : "muted"}
          >
            {heading}
          </Heading>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={classNames(styles.body, bodyClassName)}>{children}</div>
    </section>
  );
}
