type IconProps = { className?: string };

export function ArrowIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export function ChevronIcon({
  back,
  className,
}: {
  back?: boolean;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d={back ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"} />
    </svg>
  );
}

export function VerticalChevronIcon({
  up = false,
  className,
}: IconProps & { up?: boolean } = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d={up ? "m4 12 6-6 6 6" : "m4 8 6 6 6-6"} />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 14 14 6M9 6h5v5" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="m12 12 4 4" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path className="icon-fill" d="M7 4.5 15.5 10 7 15.5Z" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path
        className="icon-fill"
        d="m10 2.8 2.2 4.5 5 .8-3.6 3.5.8 5-4.4-2.4-4.4 2.4.8-5-3.6-3.5 5-.8Z"
      />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v14M3 10h14" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 10h14" />
    </svg>
  );
}

export function GitHubIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        className="icon-fill"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}

export function TicketIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.5V6h18v2.5a2.2 2.2 0 0 0 0 4.4V18H3v-5.1a2.2 2.2 0 0 0 0-4.4Z" />
      <path d="M14.5 6v1.6M14.5 10.6v2.8M14.5 16.4V18" />
    </svg>
  );
}
