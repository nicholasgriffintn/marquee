import { avatarById } from "../../domain/avatars";
import { GeneratedAvatar } from "../GeneratedAvatar";
import { useScreeningRoom } from "./ScreeningContext";

import styles from "./StageCursors.module.css";

export function StageCursors({ stage }: { stage: string }) {
  const screening = useScreeningRoom();

  if (!screening?.room || !screening.isMember) {
    return null;
  }

  const members = new Map(screening.room.members.map((member) => [member.key, member]));
  const marks = Object.entries(screening.cursors).filter(
    ([key, mark]) => mark.stage === stage && key !== screening.room?.you,
  );
  const reactions = screening.reactions.filter((reaction) => reaction.stage === stage);

  if (marks.length === 0 && reactions.length === 0) {
    return null;
  }

  return (
    <div className={styles.layer} aria-hidden="true">
      {marks.map(([key, mark]) => {
        const member = members.get(key);
        const avatar = member ? avatarById(member.avatar) : null;

        return (
          <div
            key={key}
            className={styles.cursor}
            style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
          >
            <svg className={styles.pointer} viewBox="0 0 16 20">
              <path
                d="M1 1 L15 9 L8 10 L5 18 Z"
                fill="var(--acid)"
                stroke="var(--ink)"
                strokeWidth={1.5}
              />
            </svg>
            <span className={styles.tag}>
              {avatar && <GeneratedAvatar avatar={avatar} size={20} decorative />}
              {member?.name ?? "Someone"}
            </span>
          </div>
        );
      })}

      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          className={styles.reaction}
          style={{ left: `${reaction.x * 100}%`, top: `${reaction.y * 100}%` }}
        >
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}
