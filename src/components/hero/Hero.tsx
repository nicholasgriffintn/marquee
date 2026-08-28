import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { MediaTitle } from "../../domain/catalog";
import { classNames } from "../../lib/class-names";
import { heroTitleSize, type HeroTitleSize } from "../../lib/media";
import { Eyebrow, Text } from "../../ui";
import { TitleArt } from "../TitleArt";
import styles from "./Hero.module.css";

const TITLE_SIZE_CLASS: Record<HeroTitleSize, string> = {
  full: "",
  small: styles.titleSmall,
  tiny: styles.titleTiny,
};

export type HeroActionVariant = "primary" | "secondary" | "quiet" | "outline";

const ACTION_CLASS: Record<HeroActionVariant, string> = {
  primary: styles.actionPrimary,
  secondary: styles.actionSecondary,
  quiet: styles.actionQuiet,
  outline: styles.actionOutline,
};

export function Hero({
  empty = false,
  className,
  children,
}: {
  empty?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={classNames(styles.hero, empty && styles.empty, className)}
    >
      {children}
    </section>
  );
}

export function HeroArt({ item }: { item: MediaTitle }) {
  return (
    <div className={styles.art} aria-hidden="true">
      <TitleArt
        url={item.backdropUrl}
        seed={item.id}
        label={item.title}
        width={1280}
        kind="backdrop"
        wide
        eager
      />
    </div>
  );
}

export function HeroGradient() {
  return <div className={styles.gradient} />;
}

export function HeroCopy({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={classNames(styles.copy, className)}>{children}</div>;
}

export function HeroTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h1
      className={classNames(
        styles.title,
        TITLE_SIZE_CLASS[heroTitleSize(title)],
        className,
      )}
    >
      {title}
    </h1>
  );
}

export function HeroMeta({ children }: { children: ReactNode }) {
  return (
    <Eyebrow as="p" tone="accent" weight="regular" className={styles.meta}>
      {children}
    </Eyebrow>
  );
}

export function HeroLede({ children }: { children: ReactNode }) {
  return <Text className={styles.lede}>{children}</Text>;
}

export function HeroActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames(styles.actions, className)}>{children}</div>
  );
}

export function HeroAction({
  variant = "secondary",
  icon,
  disabled,
  onClick,
  children,
}: {
  variant?: HeroActionVariant;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={classNames(styles.action, ACTION_CLASS[variant])}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className={styles.actionIcon}>{icon}</span>}
      {children}
    </button>
  );
}

export function HeroActionLink({
  to,
  variant = "secondary",
  icon,
  children,
}: {
  to: string;
  variant?: HeroActionVariant;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={classNames(styles.action, ACTION_CLASS[variant])}>
      {icon && <span className={styles.actionIcon}>{icon}</span>}
      {children}
    </Link>
  );
}
