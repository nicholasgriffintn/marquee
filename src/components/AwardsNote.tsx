import { awardLine, awardTally, type AwardSummary } from "../domain/awards";

const SHOWN = 3;

export function AwardsNote({ awards }: { awards: AwardSummary }) {
  const won = awards.entries.filter((entry) => entry.outcome === "won");

  if (awards.entries.length === 0) {
    return awards.summary ? (
      <div className="detail-awards">
        <span>Awards cabinet</span>
        <p>{awards.summary}</p>
        <small className="detail-credit">Counted by OMDb, which does not name them</small>
      </div>
    ) : null;
  }

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
      <small className="detail-credit">Named awards from Wikidata</small>
    </div>
  );
}
