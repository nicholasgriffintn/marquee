import { Link } from "react-router-dom";

import { ArrowIcon } from "../../ui";
import { UsherMark } from "./UsherMark";

import styles from "./UsherSearchHit.module.css";

const LOOKING_FOR_HIM = /^(the\s+)?usher$/iu;

export function UsherSearchHit({ query }: { query: string }) {
  if (!LOOKING_FOR_HIM.test(query.trim())) {
    return null;
  }

  return (
    <Link className={styles.usher} to="/usher">
      <UsherMark face="pleased" crop="head" className={styles.usherMark} />
      <span className={styles.usherCopy}>
        <strong>The Usher</strong>
        <small>Thirty years on the door. Not in the catalogue, but he is here.</small>
      </span>
      <em className={styles.usherArrow} aria-hidden="true">
        <ArrowIcon />
      </em>
    </Link>
  );
}
