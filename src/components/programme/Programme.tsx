import type { ReactNode } from "react";

import { formatDateTime, parseDate } from "../../lib/dates";
import { Heading, Text } from "../../ui";
import { UsherMark } from "../usher/UsherMark";

import styles from "./Programme.module.css";

const FIRST_ISSUE = Date.UTC(1974, 0, 1);

function issuedOn(value: string | undefined) {
  return parseDate(value) ?? new Date();
}

export function programmeWeek(value: string | undefined) {
  return issuedOn(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  });
}

export function issueNumber(value: string | undefined) {
  const weeks = Math.floor((issuedOn(value).getTime() - FIRST_ISSUE) / (7 * 86_400_000));

  return weeks.toLocaleString();
}

export function formatWhen(value: string) {
  return formatDateTime(value, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProgrammeMasthead({
  issuedAt,
  heading,
  note,
}: {
  issuedAt: string | undefined;
  heading: ReactNode;
  note: ReactNode;
}) {
  return (
    <header className={styles.programme}>
      <div className={styles.masthead}>
        <UsherMark face="idle" crop="head" className={styles.mastheadMark} />
        <div>
          <span className={styles.mastheadName}>The Marquee</span>
          <p className={styles.mastheadWeek}>Week of {programmeWeek(issuedAt)}</p>
        </div>
        <em className={styles.mastheadIssue}>No. {issueNumber(issuedAt)}</em>
      </div>
      <Heading level={1} size="title" className={styles.title}>
        {heading}
      </Heading>
      <Text family="serif" italic tone="muted" className={styles.note}>
        {note}
      </Text>
    </header>
  );
}

export function ProgrammeHeading({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.headingRow}>
      <Heading level={2} size="label" tone="accent" className={styles.heading}>
        {children}
      </Heading>
      {action}
    </div>
  );
}

export function EpisodeList({ children }: { children: ReactNode }) {
  return <ul className={styles.episodes}>{children}</ul>;
}

export function EpisodeItem({
  when,
  name,
  detail,
}: {
  when: string;
  name: string;
  detail: ReactNode;
}) {
  return (
    <li>
      <time dateTime={when}>{formatWhen(when)}</time>
      <strong>{name}</strong>
      <small>{detail}</small>
    </li>
  );
}
