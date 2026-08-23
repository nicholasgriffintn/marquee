import type { ReactNode } from "react";

export function PageTitle({ heading, children }: { heading: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-title-row">
      <div>
        <h1>{heading}</h1>
      </div>
      {children}
    </div>
  );
}
