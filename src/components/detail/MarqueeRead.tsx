import type { TitleInsight } from "../../hooks/useTitleInsight";

export function MarqueeRead({
  insight,
  isLoading,
}: {
  insight: TitleInsight | null;
  isLoading: boolean;
}) {
  if (!insight && !isLoading) {
    return null;
  }

  return (
    <div className="detail-insight">
      <span>
        <i>AI</i> Marquee read
      </span>
      {insight ? (
        <>
          <p>{insight.hook}</p>
          {insight.moods.length > 0 && (
            <div className="detail-moods">
              {insight.moods.map((mood) => (
                <em key={mood}>{mood}</em>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </>
      )}
    </div>
  );
}
