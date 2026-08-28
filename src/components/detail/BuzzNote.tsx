import type { TitleBuzz } from "../../domain/catalog";
import { parseDatabaseDate } from "../../lib/dates";
import { changeLabel } from "../../lib/media";
import { Text } from "../../ui";
import { DetailNote } from "./DetailNote";

import styles from "./BuzzNote.module.css";

function measuredOn(value: string) {
  return (
    parseDatabaseDate(value)?.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }) ?? value
  );
}

export function BuzzNote({ buzz }: { buzz: TitleBuzz }) {
  return (
    <DetailNote label="Trending signal" accent="acid">
      <Text>
        <strong className={styles.count}>{buzz.views.toLocaleString()}</strong> Wikipedia readers in
        the last 7 days, {changeLabel(buzz.delta)} on the {buzz.previousViews.toLocaleString()} the
        week before.
      </Text>
      <small>
        Article{" "}
        <a href={buzz.articleUrl} target="_blank" rel="noreferrer">
          {buzz.article}
        </a>{" "}
        · matched by {buzz.match === "wikidata" ? "Wikidata entity" : "title search"} · measured{" "}
        {measuredOn(buzz.measuredAt)}
      </small>
    </DetailNote>
  );
}
