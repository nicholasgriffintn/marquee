import type { TitleInsight } from "../../hooks/useTitleInsight";
import { Skeleton, Text } from "../../ui";
import { DetailNote } from "./DetailNote";

import styles from "./MarqueeRead.module.css";

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
    <DetailNote label="Marquee read" badge="AI">
      {insight ? (
        <>
          <Text family="serif" className={styles.hook}>
            {insight.hook}
          </Text>
          {insight.moods.length > 0 && (
            <div className={styles.moods}>
              {insight.moods.map((mood) => (
                <em key={mood}>{mood}</em>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Skeleton />
          <Skeleton short />
        </>
      )}
    </DetailNote>
  );
}
