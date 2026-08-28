import type { TitleVisualFormat } from "../../domain/catalog";

export function VisualFormatLine({ format }: { format: TitleVisualFormat }) {
  const parts = [format.colours.join(" and "), format.aspectRatios.join(" and ")].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className="detail-next">
      <span>Shot in</span> {parts.join(" · ")}
      <small className="detail-credit">Visual format from Wikidata</small>
    </p>
  );
}
