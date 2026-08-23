const NOTES = [
  "Threaded up whatever the vault let me have. Some of it is worth your evening. I make no promises about the rest.",
  "Everything on these shelves is out of copyright, which is not the same as being any good. You have been told.",
  "I check the prints. I do not check the films. That is somebody else's department, and he is on the door.",
  "If a reel jumps, it jumped in 1931 as well. Nothing I can do about that from in here.",
];

export function ProjectionNote({ seed = 0 }: { seed?: number }) {
  const note = NOTES[Math.abs(seed) % NOTES.length];

  return (
    <aside className="reel-note" aria-label="A note from the projection box">
      <p className="reel-note-head">
        <span>Projection box</span>
        <em>pinned to the door, undated</em>
      </p>
      <p className="reel-note-body">{note}</p>
      <p className="reel-note-foot">
        Pinned up as found. We have not spoken since 1988. — <strong>The Usher</strong>
      </p>
    </aside>
  );
}
