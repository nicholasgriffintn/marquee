import { Link } from "react-router-dom";

import { UsherMark } from "./UsherMark";

export function ManagersDoor() {
  return (
    <section className="page-section managers-office">
      <div className="office-inner">
        <div className="office-door" aria-hidden="true">
          <div className="door-glass">
            <p className="door-name">Manager</p>
            <p className="door-sub">Knock and wait</p>
          </div>
          <p className="door-note">
            Back in
            <br />
            ten minutes
          </p>
          <span className="door-handle" />
        </div>

        <div className="office-copy">
          <h1>Manager's office.</h1>
          <p>This part of the building is not yours. The screens are the other way.</p>

          <div className="office-aside">
            <UsherMark face="unimpressed" crop="head" />
            <p>He is not in. He is never in.</p>
          </div>

          <Link className="button-link" to="/">
            Back to tonight
          </Link>
        </div>
      </div>
    </section>
  );
}
