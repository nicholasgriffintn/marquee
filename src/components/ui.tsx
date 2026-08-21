import type { MediaTitle, Provider, ProviderAvailability } from "../domain/catalog";
import { providerLogo } from "../domain/provider-logos";
import { providerMark } from "../domain/providers";

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
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

export function MarqueeLogo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span>M</span>
      <i />
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
      {image && (
        <img
          src={image}
          alt={`${item.title} ${wide ? "backdrop" : "poster"}`}
          loading={wide ? "eager" : "lazy"}
        />
      )}
      {!image && <strong>{item.title}</strong>}
    </div>
  );
}
