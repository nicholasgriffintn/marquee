import { Link } from "react-router-dom";

import type { TitleBuzz } from "../../domain/catalog";
import { measuredOn } from "../../lib/dates";
import { changeLabel } from "../../lib/media";

export function BuzzNote({ buzz, titleId }: { buzz: TitleBuzz; titleId: string }) {
  return (
    <div className="detail-buzz">
      <span>Trending signal</span>
      <p>
        <strong>{buzz.views.toLocaleString()}</strong> Wikipedia readers in the last 7 days,{" "}
        {changeLabel(buzz.delta)} on the {buzz.previousViews.toLocaleString()} the week before.
      </p>
      <small>
        Article{" "}
        <a href={buzz.articleUrl} target="_blank" rel="noreferrer">
          {buzz.article}
        </a>{" "}
        · matched by {buzz.match === "wikidata" ? "Wikidata entity" : "title search"} · measured{" "}
        {measuredOn(buzz.measuredAt)}
      </small>
      <small>
        <Link to={`/world?title=${encodeURIComponent(titleId)}`}>
          See which languages it is being read in
        </Link>
      </small>
    </div>
  );
}
