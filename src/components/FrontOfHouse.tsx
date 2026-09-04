import { Link } from "react-router-dom";

import { ButtonLink, Eyebrow, Heading, Text } from "../ui";

import styles from "./FrontOfHouse.module.css";

const RECEIPTS = [
  {
    heading: "Every UK service on one board",
    detail: "Streaming, rent, buy and the cinemas near you, checked daily across 180 services.",
  },
  {
    heading: "A free screen at the back",
    detail: "Out-of-copyright prints that play here, no account and no advert.",
    to: "/revival",
  },
  {
    heading: "Your shelf, on your calendar",
    detail: "Ratings, notes and episode ticks, with a feed for your calendar and your reader.",
  },
];

export function FrontOfHouse() {
  return (
    <section className={styles.strip} aria-labelledby="front-of-house-title">
      <div className={styles.copy}>
        <Eyebrow as="p" tone="inkMuted">
          Evening. First time in?
        </Eyebrow>
        <Heading
          level={2}
          size="section"
          family="serif"
          tone="ink"
          id="front-of-house-title"
          className={styles.title}
        >
          A cinema without a building.
        </Heading>
        <Text tone="inkMuted" className={styles.line}>
          Tell me which services you pay for and I only show you what you can press play on tonight.
          It is free, there are no adverts, and nothing of yours is sold on.
        </Text>
        <div className={styles.actions}>
          <ButtonLink to="/sign-in" variant="primary" surface="paper" size="lg">
            Get a ticket
          </ButtonLink>
          <Link className={styles.tour} to="/tour">
            Or take the tour first
          </Link>
        </div>
      </div>
      <ul className={styles.receipts}>
        {RECEIPTS.map((receipt) => (
          <li key={receipt.heading} className={styles.receipt}>
            <strong>
              {receipt.to ? (
                <Link className={styles.receiptLink} to={receipt.to}>
                  {receipt.heading}
                </Link>
              ) : (
                receipt.heading
              )}
            </strong>
            <span>{receipt.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
