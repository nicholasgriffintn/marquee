import { useState } from "react";

import type { AnimeCharacter, AnimeStaffMember, MediaTitle } from "../../domain/catalog";
import { ChevronIcon } from "../../ui";
import { DetailCredit } from "./DetailNote";

import styles from "./DetailList.module.css";

const SHOWN = 6;

function CharacterList({ characters }: { characters: AnimeCharacter[] }) {
  const [showAll, setShowAll] = useState(false);
  const held = characters.length - SHOWN;
  const visible = showAll ? characters : characters.slice(0, SHOWN);

  return (
    <div className={styles.group}>
      <span className={styles.groupLabel}>Cast</span>
      <ol className={styles.list}>
        {visible.map((character, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- AnimeCharacter has no stable id, list order is API-fixed
          <li key={`${character.name}-${index}`}>
            <b>{character.name}</b>
            {character.voiceActor ? <i>{character.voiceActor}</i> : null}
            <small>{character.role}</small>
          </li>
        ))}
      </ol>
      {held > 0 && !showAll && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Show {held} more
          <ChevronIcon />
        </button>
      )}
    </div>
  );
}

function StaffList({ staff }: { staff: AnimeStaffMember[] }) {
  const [showAll, setShowAll] = useState(false);
  const held = staff.length - SHOWN;
  const visible = showAll ? staff : staff.slice(0, SHOWN);

  return (
    <div className={styles.group}>
      <span className={styles.groupLabel}>Staff</span>
      <ol className={styles.list}>
        {visible.map((member, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- AnimeStaffMember has no stable id, list order is API-fixed
          <li key={`${member.name}-${index}`}>
            <b>{member.name}</b>
            <small>{member.role}</small>
          </li>
        ))}
      </ol>
      {held > 0 && !showAll && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Show {held} more
          <ChevronIcon />
        </button>
      )}
    </div>
  );
}

export function CastAndStaff({ item }: { item: MediaTitle }) {
  const characters = item.anime?.characters ?? [];
  const staff = item.anime?.staff ?? [];

  if (characters.length === 0 && staff.length === 0) {
    return null;
  }

  return (
    <section className={styles.block} aria-label="Cast and staff">
      {characters.length > 0 && <CharacterList characters={characters} />}
      {staff.length > 0 && <StaffList staff={staff} />}
      <DetailCredit>Cast and crew from AniList</DetailCredit>
    </section>
  );
}
