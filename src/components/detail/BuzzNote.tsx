import type { TitleBuzz } from "../../domain/catalog";
import { parseDatabaseDate } from "../../lib/dates";
import { changeLabel } from "../../lib/media";

function measuredOn(value: string) {
  return (
    parseDatabaseDate(value)?.toLocaleDateString(undefined, { day: "numeric", month: "short" }) ??
    value
  );
}

export function BuzzNote({ buzz }: { buzz: TitleBuzz }) {
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
    </div>
  );
}
