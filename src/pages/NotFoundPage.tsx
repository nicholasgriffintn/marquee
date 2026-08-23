import { Link } from "react-router-dom";

import { PageTitle } from "../components/PageTitle";
import { UsherMark } from "../components/usher/UsherMark";

export function NotFoundPage() {
  return (
    <section className="page-section">
      <PageTitle heading="Not found">
        <p>That page does not exist.</p>
      </PageTitle>
      <div className="search-empty lost">
        <UsherMark face="unimpressed" crop="head" />
        <h2>Wrong door.</h2>
        <p>Nothing showing down here. The screens are the other way.</p>
        <div className="lost-actions">
          <Link className="button-link" to="/">
            Back to tonight
          </Link>
          <Link className="lost-aside" to="/usher">
            Who are you, anyway?
          </Link>
        </div>
      </div>
    </section>
  );
}
