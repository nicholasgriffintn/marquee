import { awardLine, awardTally, type AwardSummary } from "../domain/awards";
import { Text } from "../ui";
import { DetailNote } from "./detail/DetailNote";

const SHOWN = 3;

export function AwardsNote({ awards }: { awards: AwardSummary }) {
  const won = awards.entries.filter((entry) => entry.outcome === "won");

  if (awards.entries.length === 0) {
    return awards.summary ? (
      <DetailNote
        label="Awards cabinet"
        accent="acid"
        credit="Counted by OMDb, which does not name them"
      >
        <Text size="xs">{awards.summary}</Text>
      </DetailNote>
    ) : null;
  }

  const listed = won.slice(0, SHOWN);
  const held = won.length - listed.length;

  return (
    <DetailNote label="Awards cabinet" accent="acid" credit="Named awards from Wikidata">
      <Text size="xs">{awardTally(awards)}</Text>
      {listed.length > 0 && (
        <small>
          {listed.map(awardLine).join(" · ")}
          {held > 0 ? ` · and ${held} more won` : ""}
        </small>
      )}
    </DetailNote>
  );
}
