import { bestPrint, RIGHTS_LABELS, runtimeLabel, SOURCE_LABELS } from "../../domain/revival";
import { useBill, useScreening } from "../../hooks/useRevival";
import { useRevivalGate } from "../../hooks/useRevivalGate";
import { Callout, Fact, FactList, Skeleton, TextLink } from "../../ui";
import { ReelPlayer } from "../revival/ReelPlayer";
import { RevivalGate } from "../revival/RevivalGate";

import styles from "./ScreenStop.module.css";

export function ScreenStop({ isActive, isSignedIn }: { isActive: boolean; isSignedIn: boolean }) {
  const gate = useRevivalGate();
  const isOpen = isActive && gate.accepted;
  const { bill, error, isLoading } = useBill(isOpen);
  const workId = bestPrint(bill.map((slot) => slot.work))?.id;
  const screening = useScreening(isOpen ? workId : undefined);
  const work = screening.screening?.work;

  if (!gate.accepted) {
    return <RevivalGate onAccept={gate.accept} />;
  }

  if (error || screening.error) {
    return <Callout>{error || screening.error}</Callout>;
  }

  if (!work) {
    return (
      <div className={styles.waiting} aria-hidden={!isLoading}>
        <Skeleton className={styles.playerSkeleton} />
        <Skeleton className={styles.notesSkeleton} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.player}>
        <ReelPlayer work={work} startAt={0} canSave={isSignedIn} />
      </div>

      <aside className={styles.rights}>
        <p className={styles.head}>
          <span>The reasoning</span>
          <em>Checked here, not in America</em>
        </p>

        <h3 className={styles.title}>
          {work.title}
          {work.year && !work.title.includes(String(work.year)) ? (
            <small> ({work.year})</small>
          ) : null}
        </h3>

        <FactList min="100%" className={styles.facts}>
          <Fact term="Free because">{RIGHTS_LABELS[work.rightsBasis]}</Fact>
          <Fact term="UK term">
            {work.ukClear
              ? work.ukExpiresYear
                ? `Ran out in ${work.ukExpiresYear}`
                : "Run out"
              : "Not established here"}
          </Fact>
          <Fact term="Print held by">{SOURCE_LABELS[work.source]}</Fact>
          <Fact term="Delivery">
            {work.delivery === "mirror" ? "Our own room, in R2" : "Straight from the source"}
          </Fact>
          {work.runtimeSeconds ? (
            <Fact term="Running time">{runtimeLabel(work.runtimeSeconds)}</Fact>
          ) : null}
        </FactList>

        <p className={styles.note}>{work.rightsNote}</p>

        <TextLink to={`/revival/${encodeURIComponent(work.id)}`}>
          Check the working on its own page
        </TextLink>
      </aside>
    </div>
  );
}
