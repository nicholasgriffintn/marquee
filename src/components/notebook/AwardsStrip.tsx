import type { AwardRun } from "../../domain/awards";
import { useResource } from "../../hooks/useResource";

const NO_RUNS: AwardRun[] = [];

function runLine(run: AwardRun) {
  const seen = run.watched > 0 ? `, ${run.watched} of them seen` : "";

  return `${run.held} of the ${run.total} on your shelf${seen}.`;
}

export function AwardsStrip({ isSignedIn }: { isSignedIn: boolean }) {
  const { data, error, isLoading } = useResource<{ runs: AwardRun[] }>("/api/notebook/awards", {
    enabled: isSignedIn,
  });
  const runs = (data?.runs ?? NO_RUNS).filter((run) => run.total > 0);

  if (isLoading) {
    return <p className="notebook-empty">Counting the trophies…</p>;
  }

  if (error || runs.length === 0) {
    return (
      <p className="notebook-empty">
        {error || "Nothing counted yet. I check Wikidata as titles come through."}
      </p>
    );
  }

  return (
    <ul className="awards-strip">
      {runs.map((run) => (
        <li key={run.awardId}>
          <b>{run.label}</b>
          <span className="awards-strip-bar" aria-hidden="true">
            <i style={{ width: `${Math.round((run.held / run.total) * 100)}%` }} />
          </span>
          <small>{runLine(run)}</small>
        </li>
      ))}
    </ul>
  );
}
