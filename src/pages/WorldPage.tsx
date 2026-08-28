import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { UsherMark } from "../components/usher/UsherMark";
import { WorldBoard, WorldBoardRows } from "../components/world/WorldBoard";
import { useWorldLeaders } from "../hooks/useWorldBoard";

export function WorldPage() {
  const [params] = useSearchParams();
  const focused = params.get("title");
  const { boards, error, isLoading } = useWorldLeaders();

  return (
    <section className="page-section">
      <div className="notebook-head">
        <UsherMark face="thinking" crop="head" className="notebook-mark" />
        <div>
          <p className="page-eyebrow">Read elsewhere</p>
          <h1>The world board</h1>
          <p className="notebook-lede">
            Which languages a title is being read in, measured against each Wikipedia
            edition&rsquo;s own weekly volume rather than raw counts, because English would win
            every time otherwise. These are languages, not countries — reading the French article
            does not put anyone in France.
          </p>
        </div>
      </div>

      {focused && (
        <ErrorBoundary label="This board">
          <article className="world-entry">
            <h2>The one you came from</h2>
            <WorldBoard titleId={focused} />
          </article>
        </ErrorBoundary>
      )}

      {error && <p className="notebook-empty">{error}</p>}
      {isLoading && <p className="notebook-empty">Reading the board…</p>}

      {boards.map((board) => (
        <article className="world-entry" key={board.titleId}>
          <h2>
            {board.title}
            {board.year ? <span> {board.year}</span> : null}
          </h2>
          <WorldBoardRows languages={board.languages} />
        </article>
      ))}

      {!isLoading && !error && boards.length === 0 && (
        <p className="notebook-empty">
          Nothing is being read widely enough to draw a board yet. It fills as the trending sweep
          works through the catalogue.
        </p>
      )}
    </section>
  );
}
