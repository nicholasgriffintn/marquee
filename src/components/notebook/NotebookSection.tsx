import type { ReactNode } from "react";

export function NotebookSection({
  id,
  number,
  title,
  lede,
  children,
}: {
  id: string;
  number: number;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section className="notebook-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="notebook-divider">
        <i aria-hidden="true">{String(number).padStart(2, "0")}</i>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <p className="notebook-lede">{lede}</p>
      {children}
    </section>
  );
}
