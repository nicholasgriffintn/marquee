import { useState } from "react";

import type { AnimeCharacter, AnimeStaffMember, MediaTitle } from "../../domain/catalog";
import { ChevronIcon } from "../ui";

const SHOWN = 6;

function CharacterList({ characters }: { characters: AnimeCharacter[] }) {
  const [showAll, setShowAll] = useState(false);
  const held = characters.length - SHOWN;
  const visible = showAll ? characters : characters.slice(0, SHOWN);

  return (
    <div className="theme-list">
      <span>Cast</span>
      <ol>
        {visible.map((character, index) => (
          <li key={`${character.name}-${index}`}>
            <b>{character.name}</b>
            {character.voiceActor ? <i>{character.voiceActor}</i> : null}
            <small>{character.role}</small>
          </li>
        ))}
      </ol>
      {held > 0 && !showAll && (
        <button type="button" className="watch-more" onClick={() => setShowAll(true)}>
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
    <div className="theme-list">
      <span>Staff</span>
      <ol>
        {visible.map((member, index) => (
          <li key={`${member.name}-${index}`}>
            <b>{member.name}</b>
            <small>{member.role}</small>
          </li>
        ))}
      </ol>
      {held > 0 && !showAll && (
        <button type="button" className="watch-more" onClick={() => setShowAll(true)}>
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
    <section className="theme-songs" aria-label="Cast and staff">
      {characters.length > 0 && <CharacterList characters={characters} />}
      {staff.length > 0 && <StaffList staff={staff} />}
      <p className="detail-credit">Cast and crew from AniList</p>
    </section>
  );
}
