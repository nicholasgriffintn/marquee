import { useState, type ReactNode } from "react";

import { classNames } from "../../lib/class-names";
import { Eyebrow, VerticalChevronIcon } from "../../ui";
import styles from "./FilterBar.module.css";

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className={styles.bar}>{children}</div>;
}

export function Facet({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={styles.facet}>
      <Eyebrow size="sm" weight="heavy" tracking="wide">
        {label}
      </Eyebrow>
      <div className={classNames(styles.chips, wide && styles.chipsWide)}>{children}</div>
    </div>
  );
}

export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.clear} onClick={onClick}>
      Clear filters
    </button>
  );
}

export function AdvancedFacets({
  defaultOpen = false,
  children,
}: {
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <>
      <button
        type="button"
        className={classNames(styles.toggle, styles.toggleOpen)}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        Show more filters <VerticalChevronIcon />
      </button>
      <div className={classNames(styles.advanced, isOpen && styles.advancedOpen)}>
        {children}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(false)}
        >
          Show less filters <VerticalChevronIcon up />
        </button>
      </div>
    </>
  );
}
