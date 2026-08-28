import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Link } from "react-router-dom";

import { classNames } from "../lib/class-names";
import styles from "./Button.module.css";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonSurface = "dark" | "paper";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger,
  quiet: styles.quiet,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  surface?: ButtonSurface;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

function buttonClass({
  variant = "secondary",
  size = "md",
  surface = "dark",
  fullWidth,
  className,
}: Omit<SharedProps, "children">) {
  return classNames(
    styles.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    surface === "paper" && styles.paper,
    fullWidth && styles.fullWidth,
    className,
  );
}

export function Button({
  variant,
  size,
  surface,
  fullWidth,
  className,
  type = "button",
  buttonRef,
  children,
  ...rest
}: SharedProps & { buttonRef?: Ref<HTMLButtonElement> } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children"
  >) {
  return (
    <button
      ref={buttonRef}
      type={type}
      className={buttonClass({ variant, size, surface, fullWidth, className })}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  href,
  variant,
  size,
  surface,
  fullWidth,
  className,
  target,
  rel,
  onClick,
  "aria-label": ariaLabel,
  children,
}: SharedProps & {
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  "aria-label"?: string;
}) {
  const composed = buttonClass({
    variant,
    size,
    surface,
    fullWidth,
    className,
  });

  if (to !== undefined) {
    return (
      <Link
        to={to}
        className={composed}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={composed}
      target={target}
      rel={rel}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  surface,
  className,
  type = "button",
  children,
  ...rest
}: Omit<SharedProps, "fullWidth"> & { label: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children" | "aria-label"
  >) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={classNames(
        styles.button,
        styles.icon,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        surface === "paper" && styles.paper,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
