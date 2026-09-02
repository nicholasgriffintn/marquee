import type { TourStop } from "../../domain/tour";
import { TOUR_NOTES } from "../../domain/tour-notes";
import { codeUrl } from "../../lib/repo";
import { ExternalLinkIcon, Modal } from "../../ui";
import { TourDiagram } from "./TourDiagram";

import styles from "./TechNote.module.css";

export function TechNote({ stop, onClose }: { stop: TourStop; onClose: () => void }) {
  const note = TOUR_NOTES[stop.id];
  const headingId = `${stop.id}-note-heading`;

  return (
    <Modal onClose={onClose} labelledBy={headingId} className={styles.shell}>
      <article className={styles.note}>
        <header className={styles.head}>
          <p className={styles.from}>
            <span>A note from the people who built it</span>
            <em>{stop.slug}</em>
          </p>
          <h2 className={styles.heading} id={headingId}>
            {note.heading}
          </h2>
          <p className={styles.standfirst}>{note.standfirst}</p>
        </header>

        <div className={styles.body}>
          {note.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <TourDiagram spec={note.diagram} />

        <section className={styles.code} aria-labelledby={`${stop.id}-note-code`}>
          <h3 className={styles.codeHead} id={`${stop.id}-note-code`}>
            Suggested code references
          </h3>
          <ul className={styles.codeList}>
            {note.code.map((link) => (
              <li key={link.path}>
                <a href={codeUrl(link.path)} target="_blank" rel="noreferrer">
                  <code>{link.path}</code>
                  <span>{link.what}</span>
                  <ExternalLinkIcon />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </Modal>
  );
}
