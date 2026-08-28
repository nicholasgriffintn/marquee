import type { TitleVisualFormat } from "../../domain/catalog";
import { DetailLine } from "./DetailNote";

export function VisualFormatLine({ format }: { format: TitleVisualFormat }) {
  const parts = [format.colours.join(" and "), format.aspectRatios.join(" and ")].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return (
    <DetailLine label="Shot in" credit="Visual format from Wikidata">
      {parts.join(" · ")}
    </DetailLine>
  );
}
