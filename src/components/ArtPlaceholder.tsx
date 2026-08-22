import { hashString } from "../lib/string";

const POSTERS = [
  "/posters/eclipse.jpg",
  "/posters/profile.jpg",
  "/posters/night-garden.jpg",
  "/posters/desert-stairway.jpg",
  "/posters/submerged-hands.jpg",
  "/posters/night-train.jpg",
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
  const poster = POSTERS[hashString(seed) % POSTERS.length] ?? POSTERS[0];

  return (
    <img
      className={`art-placeholder${wide ? " art-placeholder-wide" : ""}`}
      src={poster}
      alt={`${label} artwork`}
      height="1200"
      loading="lazy"
      width="800"
    />
  );
}
