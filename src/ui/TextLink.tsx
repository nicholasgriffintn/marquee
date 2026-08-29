import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { classNames } from "../lib/class-names";

import styles from "./TextLink.module.css";

export type TextLinkVariant = "underline" | "aside" | "accent" | "plain";

const VARIANT_CLASS: Record<TextLinkVariant, string> = {
  underline: styles.underline,
  aside: styles.aside,
  accent: styles.accent,
  plain: styles.plain,
};

type Shared = {
  variant?: TextLinkVariant;
  surface?: "dark" | "paper";
  className?: string;
  children: ReactNode;
};

function linkClass({
  variant = "underline",
  surface = "dark",
  className,
}: Omit<Shared, "children">) {
  return classNames(
    styles.link,
    VARIANT_CLASS[variant],
    surface === "paper" && styles.paper,
    className,
  );
}

export function TextLink({
  to,
  onClick,
  ...shared
}: Shared & { to: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className={linkClass(shared)}>
      {shared.children}
    </Link>
  );
}

export function ExternalTextLink({
  href,
  onClick,
  target = "_blank",
  rel = "noreferrer",
  ...shared
}: Shared & {
  href: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
}) {
  return (
    <a href={href} target={target} rel={rel} onClick={onClick} className={linkClass(shared)}>
      {shared.children}
    </a>
  );
}
