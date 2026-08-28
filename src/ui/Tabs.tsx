import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { classNames } from "../lib/class-names";
import styles from "./Tabs.module.css";

export type TabItem = {
  id: string;
  label: ReactNode;
  count?: ReactNode;
};

export function TabList({
  label,
  tabs,
  selected,
  idPrefix,
  surface = "dark",
  onSelect,
  actions,
  className,
}: {
  label: string;
  tabs: TabItem[];
  selected: string;
  idPrefix: string;
  surface?: "dark" | "paper";
  onSelect: (id: string) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;

    if (next === null) {
      return;
    }

    event.preventDefault();
    onSelect(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={classNames(styles.list, styles[surface], className)}
    >
      {tabs.map((tab, index) => (
        <button
          type="button"
          key={tab.id}
          ref={(node) => {
            tabRefs.current[index] = node;
          }}
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-selected={selected === tab.id}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={selected === tab.id ? 0 : -1}
          className={classNames(
            styles.tab,
            selected === tab.id && styles.selected,
          )}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && tab.count !== null && (
            <em className={styles.count}>{tab.count}</em>
          )}
        </button>
      ))}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix,
  hidden,
  labelled = true,
  className,
  children,
}: {
  id: string;
  idPrefix: string;
  hidden?: boolean;
  labelled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={labelled ? `${idPrefix}-tab-${id}` : undefined}
      hidden={hidden}
      className={classNames(styles.panel, className)}
    >
      {children}
    </div>
  );
}
