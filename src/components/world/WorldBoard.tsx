import { useWorldBoard, type WorldBoardLanguage } from "../../hooks/useWorldBoard";
import { measuredOn } from "../../lib/dates";
import { languageName } from "../../lib/media";

const MIN_LANGUAGES = 2;

function sharePercent(entry: WorldBoardLanguage) {
  return Math.round(entry.share * 1000) / 10;
}

export function WorldBoardRows({ languages }: { languages: WorldBoardLanguage[] }) {
  const [leader] = languages;

  if (!leader || languages.length < MIN_LANGUAGES) {
    return null;
  }

  const widest = sharePercent(leader) || 1;

  return (
    <ul className="world-rows">
      {languages.map((entry) => (
        <li key={entry.language}>
          <a href={entry.articleUrl} target="_blank" rel="noreferrer">
            {languageName(entry.language)}
          </a>
          <div className="detail-world-bar" role="presentation">
            <i style={{ width: `${(sharePercent(entry) / widest) * 100}%` }} />
          </div>
          <strong>{sharePercent(entry)}%</strong>
          <em>{entry.views.toLocaleString()}</em>
        </li>
      ))}
    </ul>
  );
}

export function WorldBoard({ titleId }: { titleId: string }) {
  const { languages, measuredAt } = useWorldBoard(titleId);

  if (languages.length < MIN_LANGUAGES) {
    return null;
  }

  return (
    <div className="detail-world">
      <p>
        Which languages this is being read in, as a share of each Wikipedia edition&rsquo;s own
        weekly readership, so the small editions are not buried by the large ones. The count on the
        right is readers in the last seven days.
      </p>
      <WorldBoardRows languages={languages} />
      <small>
        Only the ten largest Wikipedia editions and the title&rsquo;s original language are
        measured, and an edition needs 50 readers in the week to appear here.
        {measuredAt ? ` Measured ${measuredOn(measuredAt)}.` : ""}
      </small>
    </div>
  );
}
