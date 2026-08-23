import { Link } from "react-router-dom";

import { PageTitle } from "../components/PageTitle";

export function SignedOutShelf() {
  return (
    <section className="page-section">
      <PageTitle heading="My shelf">
        <p>Sign in to keep a shelf of what you have watched.</p>
      </PageTitle>
      <div className="search-empty">
        <h2>You are signed out.</h2>
        <p>Your shelf lives with your account, so sign in to see it.</p>
        <Link className="button-link" to="/sign-in?returnTo=%2Fshelf">
          Get a ticket
        </Link>
      </div>
    </section>
  );
}
