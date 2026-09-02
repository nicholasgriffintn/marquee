import { useEffect, useRef } from "react";

import type { MediaTitle } from "../../domain/catalog";
import type { Guest } from "../../domain/notebook";
import type { TonightOrder } from "../../domain/usher";
import type { UsherOrderState } from "../../hooks/useUsher";
import { ButtonLink } from "../../ui";
import { UsherOrder } from "../usher/UsherOrder";

import styles from "./PadStop.module.css";

export type TourPad = {
  state: UsherOrderState;
  guests: Guest[];
  onStart: () => void;
  onSubmit: (order: TonightOrder, guestIds: string[]) => void;
  onAnother: () => void;
  onEdit: () => void;
};

export function PadStop({
  isActive,
  isSignedIn,
  pad,
  onOpen,
}: {
  isActive: boolean;
  isSignedIn: boolean;
  pad: TourPad;
  onOpen: (item: MediaTitle) => void;
}) {
  const openedRef = useRef(false);
  const { onStart } = pad;

  useEffect(() => {
    if (isActive && isSignedIn && !openedRef.current) {
      openedRef.current = true;
      onStart();
    }
  }, [isActive, isSignedIn, onStart]);

  if (!isSignedIn) {
    return (
      <div className={styles.shut}>
        <p className={styles.shutLine}>
          The pad is for ticket holders. It reads your shelf before it opens its mouth, and you have
          not got one yet.
        </p>
        <ButtonLink to="/sign-in?returnTo=%2Ftour%23pad" variant="primary" size="lg">
          Get a ticket
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className={styles.pad}>
      <UsherOrder
        state={pad.state}
        guests={pad.guests}
        onSubmit={pad.onSubmit}
        onOpen={onOpen}
        onAnother={pad.onAnother}
        onEdit={pad.onEdit}
      />
    </div>
  );
}
