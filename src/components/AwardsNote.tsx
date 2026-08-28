import { awardLine, awardTally, type AwardSummary } from "../domain/awards";

const SHOWN = 3;

export function AwardsNote({ awards }: { awards: AwardSummary }) {
  if (awards.entries.length === 0) {
    return null;
  }

  const won = awards.entries.filter((entry) => entry.outcome === "won");
  const listed = won.slice(0, SHOWN);
  const held = won.length - listed.length;

  return (
    <div className="detail-awards">
      <span>Awards cabinet</span>
      <p>{awardTally(awards)}</p>
      {listed.length > 0 && (
        <small>
          {listed.map(awardLine).join(" · ")}
          {held > 0 ? ` · and ${held} more won` : ""}
        </small>
      )}
      <small className="detail-credit">Awards from Wikidata</small>
    </div>
  );
}
