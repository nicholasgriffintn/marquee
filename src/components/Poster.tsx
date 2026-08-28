import type { MediaTitle } from "../domain/catalog";
import { classNames } from "../lib/class-names";
import { TitleArt } from "./TitleArt";

import styles from "./Poster.module.css";

export function Poster({
  item,
  wide = false,
  className,
}: {
  item: MediaTitle;
  wide?: boolean;
  className?: string;
}) {
  const image = wide ? (item.posterUrl ?? item.backdropUrl) : item.posterUrl;

  return (
    <div className={classNames(styles.poster, className)}>
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
