import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { classNames } from "../lib/class-names";

import styles from "./Chip.module.css";

type ChipShared = {
  selected?: boolean;
  surface?: "dark" | "paper";
  dashed?: boolean;
  className?: string;
  children: ReactNode;
};

function chipClass({
  selected,
  surface = "dark",
  dashed,
  className,
}: Omit<ChipShared, "children">) {
  return classNames(
    styles.chip,
    surface === "paper" ? styles.paper : styles.dark,
    selected && styles.selected,
    dashed && styles.dashed,
    className,
  );
}

export function Chip({
  onClick,
  disabled,
  pressed,
  title,
  ...shared
}: ChipShared & {
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={chipClass(shared)}
    >
      {shared.children}
    </button>
  );
}

export function ChipLink({ to, ...shared }: ChipShared & { to: string }) {
  return (
    <Link to={to} className={chipClass(shared)}>
      {shared.children}
    </Link>
  );
}

export function ChipTag(shared: ChipShared) {
  return <span className={chipClass(shared)}>{shared.children}</span>;
}
