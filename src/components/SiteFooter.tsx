import { Link } from "react-router-dom";

import { MarqueeLogo } from "./ui";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="brand">
        <MarqueeLogo />
        <span>Marquee</span>
      </div>
      <p>
        Data by TMDB · Availability by JustWatch · Cinemas by{" "}
        <a
          className="footer-link"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <Link className="footer-link" to="/sources">
          Services and sources
        </Link>
      </p>
      <Link className="footer-egg" to="/usher">
        Made for movie night
      </Link>
    </footer>
  );
}
