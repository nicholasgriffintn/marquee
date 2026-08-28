import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { UsherMark } from "../components/usher/UsherMark";
import type { UsherFace } from "../domain/usher";
import { classNames } from "../lib/class-names";
import { Fact, FactList, Heading } from "../ui";

import styles from "./UsherPage.module.css";

type Scene = {
  id: string;
  slug: string;
  face: UsherFace;
  action: string[];
  line: string;
  speaker?: string;
};

const SCENES: Scene[] = [
  {
    id: "sign",
    slug: "Ext. The Marquee — Night — 1974",
    face: "unimpressed",
    action: [
      "A hundred and forty bulbs spelling a word nobody reads any more. Rain on the pavement, and the queue for the late showing pretending it isn't there.",
      "One letter has been out for a week.",
    ],
    line: "That was me. I'd had enough of being looked at.",
  },
  {
    id: "climb",
    slug: "Ext. The Marquee — Continuous",
    face: "thinking",
    action: [
      "The M comes down the front of the building in the dark. Thirty feet, no rope, one bad landing behind the ticket kiosk.",
      "Nobody notices. They are all watching the doors.",
    ],
    line: "Thirty feet. I'd do it again.",
  },
  {
    id: "hired",
    slug: "Int. Manager's Office — Morning",
    face: "idle",
    action: [
      "The manager looks up at a letter of the alphabet standing on his carpet, wearing a bow tie it has found somewhere and holding a torch it has not asked permission for.",
      "He has been doing this job a long time. He is too tired to ask.",
    ],
    speaker: "Manager",
    line: "Can you start Friday?",
  },
  {
    id: "years",
    slug: "Int. Auditorium — Thirty Years, Passing",
    face: "dormant",
    action: [
      "Torch. Aisle. Seat number. Repeat.",
      "He learns which films empty a room at the ninety-minute mark and which ones nobody moves for, not even for the toilet. He learns that the people who ask for a recommendation already know what they want and are hoping you'll talk them into it.",
    ],
    line: "You see everything twice in this trade. Once on the screen. Once on their faces.",
  },
  {
    id: "pad",
    slug: "Int. The Foyer — A Wednesday, 1981",
    face: "thinking",
    action: [
      "A couple have been reading the board for eleven minutes. He knows the type. They will read it until the film they are arguing about has started without them.",
      "He takes the pad out of his waistcoat, the one the kiosk uses for refunds, and asks them three questions. Who is watching. How long they have. What they are in the mood for. Then he writes one title on it and hands it over.",
      "They go in. On the way out she tells him it was the best thing they had seen all year. He says nothing, because a good usher does not say I told you so, and because the pad is already out for the next lot.",
    ],
    line: "Three questions. Nobody has ever needed a fourth.",
  },
  {
    id: "door",
    slug: "Int. The Corridor — Any Given Night",
    face: "unimpressed",
    action: [
      "Most of the job is letting people in. The rest of it is not. Sales reps. Two lads with one ticket between them. A man with a clipboard who says he is from head office and cannot say which one.",
      "At the far end of the corridor there is a door with frosted glass and a name painted on it. In thirty years he has knocked twice, and waited both times.",
    ],
    line: "I have seen a lot of faces come through that door. I remember the ones that were lying.",
  },
  {
    id: "closing",
    slug: "Ext. The Marquee — Night — Closing",
    face: "unimpressed",
    action: [
      "The building comes down on a Tuesday. The sign goes in a skip. Someone takes a photograph for the local paper and spells the name wrong in the caption.",
      "The M does not go in the skip.",
    ],
    line: "The building was never the point.",
  },
];

export function UsherPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const scenes = [...root.querySelectorAll<HTMLElement>(`.${styles.scene}`)];

    for (const scene of scenes) {
      scene.classList.add(styles.pending);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.shown);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -8% 0px" },
    );

    for (const scene of scenes) {
      observer.observe(scene);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.reel} ref={rootRef}>
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.bulbs} aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <i key={index} className={classNames(index === 11 && styles.dead)} />
        ))}
      </div>

      <section className={styles.card}>
        <div className={styles.cert}>
          <p className={styles.certBoard}>The British Board of Movie Night</p>
          <div className={styles.certMark}>
            <UsherMark face="idle" crop="head" />
          </div>
          <Heading level={1} size="title" family="serif" tone="ink" className={styles.certTitle}>
            The Usher
          </Heading>
          <FactList min="100%" className={styles.certFacts}>
            <Fact term="Certificate">U — suitable for all</Fact>
            <Fact term="Running time">Two minutes</Fact>
            <Fact term="Format">Presented in Marqueevision</Fact>
          </FactList>
          <p className={styles.certNote}>
            Contains one fall from height, mild disdain for popular things, and no apologies.
          </p>
        </div>
        <p className={styles.scroll} aria-hidden="true">
          Scroll to begin
        </p>
      </section>

      {SCENES.map((scene, index) => (
        <section className={styles.scene} key={scene.id} aria-labelledby={`${scene.id}-slug`}>
          <div className={styles.inner}>
            <h2 className={styles.slug} id={`${scene.id}-slug`}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              {scene.slug}
            </h2>
            <div className={styles.body}>
              <div className={styles.action}>
                {scene.action.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <blockquote>
                  <cite>{scene.speaker ?? "The Usher"}</cite>
                  <p>{scene.line}</p>
                </blockquote>
              </div>
              <figure className={styles.figure}>
                <UsherMark face={scene.face} className={styles.figureMark} />
              </figure>
            </div>
          </div>
          <div className={styles.perf} aria-hidden="true" />
        </section>
      ))}

      <section className={classNames(styles.scene, styles.dark)} aria-labelledby="now-slug">
        <div className={styles.beam} aria-hidden="true" />
        <div className={styles.inner}>
          <h2 className={styles.slug} id="now-slug">
            <i>{String(SCENES.length + 1).padStart(2, "0")}</i>
            Int. Here — Now
          </h2>
          <div className={classNames(styles.action, styles.actionWide)}>
            <p>
              There is no building. There is a catalogue of very nearly everything, a viewer who
              cannot decide, and a man with a torch who has seen all of it and has opinions about
              most of it.
            </p>
            <blockquote>
              <cite>The Usher</cite>
              <p>Evening. Rows are lettered. Mind the step.</p>
            </blockquote>
          </div>
          <figure className={classNames(styles.figure, styles.figureNow)} aria-hidden="true">
            <UsherMark face="idle" className={styles.figureMark} />
          </figure>

          <Link className={styles.cta} to="/">
            Find your seat
          </Link>
        </div>
      </section>

      <section className={styles.credits} aria-label="End credits">
        <div className={styles.roll}>
          <p className={styles.end}>The End</p>
          <dl className={styles.rollList}>
            <div>
              <dt>The Usher</dt>
              <dd>Himself</dd>
            </div>
            <div>
              <dt>The Manager</dt>
              <dd>Never seen</dd>
            </div>
            <div>
              <dt>The Projectionist</dt>
              <dd>Also never seen</dd>
            </div>
            <div>
              <dt>Titles and artwork</dt>
              <dd>TMDB</dd>
            </div>
            <div>
              <dt>Where to watch</dt>
              <dd>JustWatch</dd>
            </div>
            <div>
              <dt>Air dates</dt>
              <dd>TVmaze</dd>
            </div>
            <div>
              <dt>Ratings, awards and box office</dt>
              <dd>OMDb</dd>
            </div>
            <div>
              <dt>Anime tags</dt>
              <dd>MyAnimeList</dd>
            </div>
            <div>
              <dt>What people are reading</dt>
              <dd>Wikipedia</dd>
            </div>
            <div>
              <dt>Shelves and picks</dt>
              <dd>Cloudflare Workers AI</dd>
            </div>
            <div>
              <dt>Bulbs</dt>
              <dd>One hundred and forty, one short</dd>
            </div>
            <div>
              <dt>Knocks on the office door</dt>
              <dd>Two, in thirty years</dd>
            </div>
          </dl>
          <p className={styles.fine}>
            No letters of the alphabet were harmed in the making of this cinema.
          </p>
        </div>
      </section>
    </div>
  );
}
