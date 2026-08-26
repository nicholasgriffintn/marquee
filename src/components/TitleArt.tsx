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
  portraitUrl,
}: {
  url: string | null | undefined;
  seed: string;
  label: string;
  width: number;
  kind?: "poster" | "backdrop";
  alt?: string;
  wide?: boolean;
  eager?: boolean;
  portraitUrl?: string | null;
}) {
  const [failed, setFailed] = useState("");
  const src = artwork(url ?? null, width, kind);
  const portraitSrc = artwork(portraitUrl ?? null, 320, "poster");

  if ((!src && !portraitSrc) || failed) {
    return <ArtPlaceholder seed={seed} label={label} wide={wide} />;
  }

  const fallbackSrc = src ?? portraitSrc;
  const height = Math.round(width * (kind === "backdrop" ? 9 / 16 : 3 / 2));
  const image = (
    <img
      src={fallbackSrc ?? undefined}
      srcSet={artworkSrcSet(url ?? portraitUrl ?? null, width, kind)}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed("failed")}
    />
  );

  if (!portraitSrc) {
    return image;
  }

  return (
    <picture>
      <source
        media="(max-width: 760px)"
        srcSet={artworkSrcSet(portraitUrl ?? null, 320, "poster") ?? portraitSrc}
      />
      {image}
    </picture>
  );
}
