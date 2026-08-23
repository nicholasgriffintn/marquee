import { useState } from "react";

import { ArtPlaceholder } from "./ArtPlaceholder";

export function TitleImage({
  src,
  srcSet,
  seed,
  label,
  alt = "",
  wide = false,
  eager = false,
}: {
  src: string | null;
  srcSet?: string;
  seed: string;
  label: string;
  alt?: string;
  wide?: boolean;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState("");

  if (!src || failed === src) {
    return <ArtPlaceholder seed={seed} label={label} wide={wide} />;
  }

  return (
    <img
      src={src}
      srcSet={srcSet}
      alt={alt}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(src)}
    />
  );
}
