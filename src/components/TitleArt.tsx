import { useState } from "react";

import { artwork, artworkSrcSet } from "../lib/media";
import { ArtPlaceholder } from "./ArtPlaceholder";

export function TitleArt({
  url,
  seed,
  label,
  width,
  kind = "poster",
  alt = "",
  wide = false,
  eager = false,
}: {
  url: string | null | undefined;
  seed: string;
  label: string;
  width: number;
  kind?: "poster" | "backdrop";
  alt?: string;
  wide?: boolean;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const src = artwork(url ?? null, width, kind);

  if (!src || failed === src) {
    return <ArtPlaceholder seed={seed} label={label} wide={wide} />;
  }

  const height = Math.round(width * (kind === "backdrop" ? 9 / 16 : 3 / 2));

  return (
    <img
      src={src}
      srcSet={artworkSrcSet(url ?? null, width, kind)}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(src)}
    />
  );
}
