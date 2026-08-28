import { classNames } from "../lib/class-names";
import { hashString } from "../lib/string";

import styles from "./ArtPlaceholder.module.css";

const TALL = [
  "/posters/eclipse.jpg",
  "/posters/profile.jpg",
  "/posters/night-garden.jpg",
  "/posters/desert-stairway.jpg",
  "/posters/submerged-hands.jpg",
  "/posters/night-train.jpg",
] as const;

const WIDE = [
  "/thumbnails/01-projector-spiral.jpg",
  "/thumbnails/02-expressionist-stairs.jpg",
  "/thumbnails/03-iris-aperture.jpg",
  "/thumbnails/04-celluloid-checker.jpg",
  "/thumbnails/05-glass-plates.jpg",
  "/thumbnails/06-clockwork.jpg",
  "/thumbnails/07-art-deco-stage.jpg",
  "/thumbnails/08-night-checker.jpg",
  "/thumbnails/09-jazz-geometry.jpg",
  "/thumbnails/10-searchlights.jpg",
  "/thumbnails/11-signal-rings.jpg",
  "/thumbnails/12-dazzle-sea.jpg",
  "/thumbnails/13-contour-map.jpg",
  "/thumbnails/14-blackout-windows.jpg",
  "/thumbnails/15-atomic-orbits.jpg",
  "/thumbnails/16-instructional-arrows.jpg",
  "/thumbnails/17-formica.jpg",
  "/thumbnails/18-test-pattern.jpg",
  "/thumbnails/19-crystal-planets.jpg",
  "/thumbnails/20-op-art.jpg",
  "/thumbnails/21-mod-targets.jpg",
  "/thumbnails/22-liquid-optics.jpg",
  "/thumbnails/23-film-burn.jpg",
  "/thumbnails/24-reel-canisters.jpg",
  "/thumbnails/25-industrial-rollers.jpg",
  "/thumbnails/26-broadcast-bars.jpg",
] as const;

export function ArtPlaceholder({
  seed,
  label,
  wide = false,
}: {
  seed: string;
  label: string;
  wide?: boolean;
}) {
  const shelf = wide ? WIDE : TALL;
  const art = shelf[hashString(seed) % shelf.length] ?? shelf[0];

  return (
    <img
      className={classNames(styles.art, wide && styles.wide)}
      src={art}
      alt={`${label} artwork`}
      height={wide ? "620" : "1200"}
      loading="lazy"
      width={wide ? "1102" : "800"}
    />
  );
}
