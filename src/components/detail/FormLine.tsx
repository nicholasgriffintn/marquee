import type { TitleForm } from "../../domain/catalog";

export function FormLine({ form }: { form: TitleForm }) {
  const parts = [form.colour, form.aspectRatio].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className="detail-next">
      <span>Shot in</span> {parts.join(" · ")}
      <small className="detail-credit">Form from Wikidata</small>
    </p>
  );
}
