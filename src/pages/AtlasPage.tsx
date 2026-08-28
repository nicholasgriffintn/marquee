import { Link } from "react-router-dom";

import { ShelfAtlas } from "../components/atlas/ShelfAtlas";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UsherMark } from "../components/usher/UsherMark";

export function AtlasPage({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <section className="page-section">
      <div className="notebook-head">
        <UsherMark face="thinking" crop="head" className="notebook-mark" />
        <div>
          <p className="page-eyebrow">Your shelf</p>
          <h1>The atlas</h1>
          <p className="notebook-lede">
            The same shelf as <Link to="/shelf">the one you keep</Link>, placed by where the cameras
            actually stood. A film gets a pin for every location filed against it, so the
            well-documented ones take up more room than they deserve. Hover a pin, or tab to it, and
            I will tell you what was shot there.
          </p>
        </div>
      </div>
      <ErrorBoundary label="This atlas">
        <ShelfAtlas isSignedIn={isSignedIn} />
      </ErrorBoundary>
    </section>
  );
}
