import { useEffect, useRef, useState } from "react";

import type { MediaTitle, Provider, ProviderAvailability } from "../domain/catalog";
import { providerLogo } from "../domain/provider-logos";
import { providerMark } from "../domain/providers";
import { TitleArt } from "./TitleArt";

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export function ChevronIcon({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d={back ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"} />
    </svg>
  );
}

export type DropdownOption = {
  key: string;
  selected: boolean;
  content: React.ReactNode;
};

export function Dropdown({
  label,
  trigger,
  options,
  onSelect,
  className,
}: {
  label: string;
  trigger: React.ReactNode;
  options: DropdownOption[];
  onSelect: (key: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = `${className ?? "dropdown"}-panel`;

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
      setActive(options.findIndex((option) => option.selected));
    }
  }, [isOpen]);

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

  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!wrapRef.current?.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  }

  return (
    <div className={`dropdown${className ? ` ${className}` : ""}`} ref={wrapRef} onBlur={onBlur}>
      <button
        type="button"
        role="combobox"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={label}
        aria-activedescendant={isOpen && active >= 0 ? `${panelId}-option-${active}` : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        {trigger}
        <ChevronIcon />
      </button>
      {isOpen && (
        <div className="dropdown-panel" id={panelId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              type="button"
              key={option.key}
              id={`${panelId}-option-${index}`}
              tabIndex={-1}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={option.selected}
              className={`dropdown-option${option.selected ? " selected" : ""}${index === active ? " active" : ""}`}
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

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v14M3 10h14" />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export function TicketIcon() {
  return (
    <svg className="ticket-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.5V6h18v2.5a2.2 2.2 0 0 0 0 4.4V18H3v-5.1a2.2 2.2 0 0 0 0-4.4Z" />
      <path d="M14.5 6v1.6M14.5 10.6v2.8M14.5 16.4V18" />
    </svg>
  );
}

export function MarqueeLogo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/logo.svg" alt="" />
    </span>
  );
}

export function ProviderBadge({
  provider,
  compact = false,
}: {
  provider: Provider | ProviderAvailability;
  compact?: boolean;
}) {
  const logo = providerLogo(provider.id);

  return (
    <span
      className={`provider-badge${compact ? " provider-badge-compact" : ""}`}
      title={provider.name}
    >
      {logo ? (
        <img src={logo} alt="" loading="lazy" />
      ) : (
        <span>{providerMark(provider.id, provider.name)}</span>
      )}
    </span>
  );
}

export function Poster({ item, wide = false }: { item: MediaTitle; wide?: boolean }) {
  const image = wide ? (item.posterUrl ?? item.backdropUrl) : item.posterUrl;

  return (
    <div className={`poster${wide ? " poster-wide" : ""}${image ? "" : " poster-missing"}`}>
      <TitleArt
        url={image}
        seed={item.id}
        label={item.title}
        width={wide ? 780 : 320}
        kind={wide && !item.posterUrl ? "backdrop" : "poster"}
        alt={`${item.title} ${wide ? "backdrop" : "poster"}`}
        wide={wide}
        eager={wide}
      />
    </div>
  );
}
