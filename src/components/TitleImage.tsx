import { useState } from "react";

import { ArtPlaceholder } from "./ArtPlaceholder";

export function TitleImage({
  src,
  seed,
  label,
  alt = "",
  wide = false,
  eager = false,
}: {
  src: string | null;
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
    <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} onError={() => setFailed(src)} />
  );
}
