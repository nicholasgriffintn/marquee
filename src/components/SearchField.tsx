import { classNames } from "../lib/class-names";
import { SearchIcon } from "../ui";

import styles from "./SearchField.module.css";

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={classNames(styles.field, className)}>
      <span aria-hidden="true" className={styles.icon}>
        <SearchIcon />
      </span>
      <input
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </label>
  );
}
