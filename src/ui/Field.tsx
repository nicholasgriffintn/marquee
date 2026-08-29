import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { classNames } from "../lib/class-names";
import { Eyebrow } from "./Eyebrow";
import { Text } from "./Text";

import styles from "./Field.module.css";

export type FieldSurface = "dark" | "paper";

export function Field({
  label,
  hint,
  htmlFor,
  surface = "dark",
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  surface?: FieldSurface;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames(styles.field, className)}>
      <Eyebrow
        as="label"
        size="sm"
        weight="heavy"
        tracking="wide"
        tone={surface === "paper" ? "inkMuted" : "muted"}
        htmlFor={htmlFor}
      >
        {label}
      </Eyebrow>
      {children}
      {hint && (
        <Text size="xs" tone={surface === "paper" ? "inkMuted" : "muted"}>
          {hint}
        </Text>
      )}
    </div>
  );
}

export function TextInput({
  surface = "dark",
  size = "md",
  className,
  ...rest
}: {
  surface?: FieldSurface;
  size?: "sm" | "md" | "lg";
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size">) {
  return (
    <input
      className={classNames(styles.control, styles[surface], styles[size], className)}
      {...rest}
    />
  );
}

export function TextArea({
  surface = "dark",
  className,
  ...rest
}: { surface?: FieldSurface; className?: string } & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
>) {
  return (
    <textarea
      className={classNames(styles.control, styles[surface], styles.area, className)}
      {...rest}
    />
  );
}

export function LabelledField({
  label,
  hint,
  surface = "dark",
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  surface?: FieldSurface;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();

  return (
    <Field label={label} hint={hint} htmlFor={id} surface={surface} className={className}>
      {children(id)}
    </Field>
  );
}
