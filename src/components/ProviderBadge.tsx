import type { Provider, ProviderAvailability } from "../domain/catalog";
import { providerLogo } from "../domain/provider-logos";
import { providerMark } from "../domain/providers";
import { classNames } from "../lib/class-names";

import styles from "./ProviderBadge.module.css";

export function ProviderBadge({
  provider,
  compact = false,
  className,
}: {
  provider: Provider | ProviderAvailability;
  compact?: boolean;
  className?: string;
}) {
  const logo = providerLogo(provider.id);

  return (
    <span
      className={classNames(styles.badge, compact && styles.compact, className)}
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
