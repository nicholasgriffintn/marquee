import { Link } from "react-router-dom";

import { hubPath } from "../domain/revival";
import { Heading, Page } from "../ui";

import styles from "./LegalPage.module.css";

const EXAMPLES = [
  {
    title: "Nosferatu",
    year: 1922,
    note: "Free in Britain since 2020. Henrik Galeen, who wrote it, died in 1949, and he was the last of the named authors to go.",
  },
  {
    title: "The Lost World",
    year: 1925,
    note: "Free in America, in copyright here until 2043. The American rule counts from publication. Ours counts from people.",
  },
  {
    title: "Metropolis",
    year: 1927,
    note: "In copyright here until 2047. Fritz Lang died in 1976, and the term runs seventy years from the end of that year.",
  },
];

export function RevivalTermPage() {
  return (
    <Page as="article" className={styles.page} labelledBy="term-title">
      <header className={styles.masthead}>
        <div>
          <Heading
            level={1}
            size="display"
            family="serif"
            tone="ink"
            id="term-title"
            className={styles.title}
          >
            Free there is not free here.
          </Heading>
          <p className={styles.standfirst}>
            Why a film can be public domain in America and still in copyright in Britain, and how
            the revival house checks before it presses play.
          </p>
        </div>

        <aside className={styles.summary} aria-label="The short version">
          <strong>The short version</strong>
          <p>
            In the UK a film&rsquo;s copyright runs for seventy years from the death of the last of
            its principal director, its writers and its composer. It is measured from people, not
            from a release date, so &ldquo;published long enough ago&rdquo; tells you nothing here.
          </p>
          <span className={styles.updated}>
            Section 13B, Copyright, Designs and Patents Act 1988
          </span>
        </aside>
      </header>

      <div className={styles.layout}>
        <nav className={styles.contents} aria-label="On this page">
          <strong>On this page</strong>
          <ol>
            <li>
              <a href="#two-questions">Two different questions</a>
            </li>
            <li>
              <a href="#rule">The British rule</a>
            </li>
            <li>
              <a href="#examples">Three worked examples</a>
            </li>
            <li>
              <a href="#checking">How the check is done</a>
            </li>
            <li>
              <a href="#playing">Playing versus copying</a>
            </li>
            <li>
              <a href="#sources">Where the prints come from</a>
            </li>
            <li>
              <a href="#wrong">If we have got it wrong</a>
            </li>
          </ol>
        </nav>

        <div className={styles.copy}>
          <section id="two-questions" className={styles.section}>
            <h2>Two different questions</h2>
            <p>
              Most public domain film collections answer an American question: has this been
              published long enough that the United States no longer protects it? For a film from
              1927 the answer is yes, and a great many lists stop there.
            </p>
            <p>
              The revival house is a British building, so it has to ask a different question: is
              this print free <em>here</em>? The two answers disagree more often than you would
              think, because the two countries measure the term from different things.
            </p>
          </section>

          <section id="rule" className={styles.section}>
            <h2>The British rule</h2>
            <p>
              Under section 13B of the Copyright, Designs and Patents Act 1988, copyright in a film
              expires seventy years from the end of the year in which the last of these people died:
              the principal director, the author of the screenplay, the author of the dialogue, and
              the composer of any music written specially for the film.
            </p>
            <p>
              Nothing in that sentence mentions the year the film came out. A silent film from 1925
              whose writer lived to 1972 is in copyright here until the end of 2042. A film from the
              same year whose last author died in 1940 has been free since 2011.
            </p>
            <p>
              There is a shorter rule for works whose authors are genuinely unknown, but &ldquo;we
              could not find out who wrote it&rdquo; and &ldquo;there is nobody to find&rdquo; are
              not the same claim, and only the second one shortens the term. We do not fall back to
              it.
            </p>
          </section>

          <section id="examples" className={styles.section}>
            <h2>Three worked examples</h2>
            <ul>
              {EXAMPLES.map((example) => (
                <li key={example.title}>
                  <strong>
                    {example.title} ({example.year}).
                  </strong>{" "}
                  {example.note}
                </li>
              ))}
            </ul>
          </section>

          <section id="checking" className={styles.section}>
            <h2>How the check is done</h2>
            <p>
              Every print is matched to the catalogue, and its director, writers and composer are
              read off Wikidata along with their dates of death. A print clears the UK term only
              when every named author has a date of death on record and the latest of them is more
              than seventy years ago.
            </p>
            <p>
              Nothing else clears itself. A print whose authors cannot be established sits in a
              queue for a person to look at, alongside a note saying which of the two kinds of
              unknown it appears to be, and what the term would be if it really were anonymous. That
              is the right way round to be wrong, and it does mean the shelves fill slowly.
            </p>
          </section>

          <section id="playing" className={styles.section}>
            <h2>Playing versus copying</h2>
            <p>
              Whether a print can play here and whether we may keep a copy of it are separate
              questions. A print that clears only the American term is listed and streams straight
              from wherever it already lives: your browser talks to the archive that holds it, and
              Marquee is pointing at a copy someone else chose to publish rather than making one of
              its own.
            </p>
            <p>
              A print that clears the British term as well earns something more: a permanent copy in
              our own vault, so it no longer depends on somebody else&rsquo;s server staying up.
              Every print says which of the two it is on its own page.
            </p>
          </section>

          <section id="sources" className={styles.section}>
            <h2>Where the prints come from</h2>
            <p>
              Three places supply them. European archives through Europeana, filtered to holdings
              they have published outright as public domain and serve as an actual file. The Library
              of Congress National Screening Room, which offers the file for download when it is not
              aware of a restriction. And the Internet Archive, which is an open upload platform and
              is never taken at its word.
            </p>
            <p>
              Each print carries its provenance: which basis it is free under, when the UK term ran
              out, who holds the copy, and a link back to the source record. You can check the
              reasoning rather than take ours.
            </p>
          </section>

          <section id="wrong" className={styles.section}>
            <h2>If we have got it wrong</h2>
            <p>
              Say so. A print that is on the wrong shelf comes down the same day, and the argument
              happens afterwards.
            </p>
            <p>
              The shelves themselves are through <Link to="/revival">the revival house</Link>. The
              silent decade is a good place to start:{" "}
              <Link to={hubPath("decade", "1920")}>the 1920s</Link>.
            </p>
          </section>
        </div>
      </div>
    </Page>
  );
}
