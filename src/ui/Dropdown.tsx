import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { ChevronIcon } from "./Icons";

import styles from "./Dropdown.module.css";

export type DropdownOption = {
  key: string;
  selected: boolean;
  content: ReactNode;
};

export function Dropdown({
  label,
  trigger,
  options,
  onSelect,
  size = "md",
  className,
}: {
  label: string;
  trigger: ReactNode;
  options: DropdownOption[];
  onSelect: (key: string) => void;
  size?: "md" | "compact";
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = useId();

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, isOpen]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }

      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!isOpen) {
        setActive(options.findIndex((option) => option.selected));
        setIsOpen(true);

        return;
      }

      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;

        return Math.min(Math.max(next, 0), options.length - 1);
      });

      return;
    }

    if (isOpen && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const option = options[active];

      if (option) {
        onSelect(option.key);
        setIsOpen(false);
      }
    }
  }

  function toggleOpen() {
    if (isOpen) {
      setIsOpen(false);

      return;
    }

    setActive(options.findIndex((option) => option.selected));
    setIsOpen(true);
  }

  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!wrapRef.current?.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  }

  return (
    <div className={classNames(styles.dropdown, className)} ref={wrapRef} onBlur={onBlur}>
      <button
        type="button"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
        role="combobox"
        className={classNames(styles.trigger, size === "compact" && styles.compact)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={label}
        aria-activedescendant={isOpen && active >= 0 ? `${panelId}-option-${active}` : undefined}
        onClick={toggleOpen}
        onKeyDown={onKeyDown}
      >
        {trigger}
        <ChevronIcon />
      </button>
      {isOpen && (
        <div
          className={styles.panel}
          id={panelId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => (
            <button
              type="button"
              key={option.key}
              id={`${panelId}-option-${index}`}
              tabIndex={-1}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- select/datalist can't implement an aria-activedescendant combobox
              role="option"
              aria-selected={option.selected}
              className={classNames(
                styles.option,
                size === "compact" && styles.compact,
                option.selected && styles.selected,
                index === active && styles.active,
              )}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                onSelect(option.key);
                setIsOpen(false);
              }}
            >
              {option.content}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
