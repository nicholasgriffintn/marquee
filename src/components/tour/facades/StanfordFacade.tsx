import { useId } from "react";

import type { MediaTitle } from "../../../domain/catalog";
import { BoardText, boardLines, Bulbs, facadeLabel } from "./parts";

import styles from "./CinemaFacade.module.css";

const LETTERS = "MARQUEE".split("").map((letter, index) => ({ letter, y: 94 + index * 20 }));
const CHEVRONS = [230, 248, 266];
const WING = { width: 140, fontSize: 11 };
const WING_FILLS = ["var(--coral)", "var(--blue)"];

function Pilaster({ x }: { x: number }) {
  return (
    <g>
      <rect x={x - 4} y={54} width={30} height={8} fill="var(--ink)" />
      <rect
        x={x}
        y={62}
        width={22}
        height={200}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      {[6, 11, 16].map((offset) => (
        <line
          key={offset}
          x1={x + offset}
          x2={x + offset}
          y1={70}
          y2={254}
          stroke="var(--ink)"
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

function Wing({ side, lines, head }: { side: "left" | "right"; lines: string[]; head: string }) {
  const mirror = side === "left" ? 1 : -1;
  const outer = 240 - mirror * 178;
  const inner = 240 - mirror * 22;
  const centre = (outer + inner) / 2;

  return (
    <g>
      <path
        d={`M${outer} 160 L${inner} 148 L${inner} 264 L${outer} 252 Z`}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <path
        d={`M${outer + mirror * 7} 168 L${inner - mirror * 6} 157 L${inner - mirror * 6} 255 L${outer + mirror * 7} 244 Z`}
        fill="var(--paper)"
        stroke="var(--paper-line)"
        strokeWidth={1}
      />
      <text className={styles.head} x={centre} y={176} fontSize={5.5} textAnchor="middle">
        {head}
      </text>
      <BoardText
        lines={lines}
        slots={2}
        x={centre}
        y={204}
        step={30}
        fontSize={WING.fontSize}
        width={WING.width}
        fills={WING_FILLS}
      />
      <Bulbs from={[outer + mirror * 6, 258]} to={[inner - mirror * 8, 269]} count={9} r={2.4} />
    </g>
  );
}

function Doors({ x }: { x: number }) {
  return (
    <g>
      {[0, 24].map((offset) => (
        <g key={offset}>
          <rect
            x={x + offset}
            y={300}
            width={20}
            height={96}
            fill="var(--panel-tile)"
            stroke="var(--ink)"
            strokeWidth={2}
          />
          <rect
            x={x + offset + 4}
            y={306}
            width={12}
            height={40}
            fill="var(--panel)"
            stroke="var(--ink)"
            strokeWidth={1}
          />
          <circle cx={x + offset + (offset ? 5 : 15)} cy={352} r={1.5} fill="var(--acid)" />
        </g>
      ))}
    </g>
  );
}

export function StanfordFacade({ showing }: { showing: MediaTitle[] }) {
  const patternId = useId();
  const left = boardLines(showing, 2, WING.width, WING.fontSize);
  const right = boardLines(showing, 2, WING.width, WING.fontSize, 2);

  return (
    <svg
      className={styles.facade}
      viewBox="0 0 480 420"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg is the picture, role=img is the standard pattern
      role="img"
      aria-label={facadeLabel("The Stanford", [...left, ...right])}
    >
      <defs>
        <pattern id={patternId} width={8} height={8} patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6" stroke="var(--ink)" strokeWidth={1} />
          <path d="M0 0 L8 8" stroke="var(--ink)" strokeWidth={1} />
        </pattern>
      </defs>

      <rect x={98} y={48} width={300} height={352} fill="var(--blue)" />
      <rect
        x={90}
        y={40}
        width={300}
        height={356}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={3}
      />

      <path
        d="M196 40 L240 12 L284 40 Z"
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <circle cx={240} cy={31} r={6} fill="var(--coral)" stroke="var(--ink)" strokeWidth={2} />

      <Pilaster x={100} />
      <Pilaster x={358} />

      <rect
        x={136}
        y={62}
        width={64}
        height={46}
        fill={`url(#${patternId})`}
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={280}
        y={62}
        width={64}
        height={46}
        fill={`url(#${patternId})`}
        stroke="var(--ink)"
        strokeWidth={2}
      />

      <Wing side="left" lines={left} head="NOW SHOWING" />
      <Wing side="right" lines={right} head="ALSO SHOWING" />

      <rect
        x={220}
        y={56}
        width={40}
        height={238}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <circle cx={240} cy={66} r={3} className={styles.bulb} />
      {LETTERS.map(({ letter, y }) => (
        <text
          key={y}
          className={styles.sans}
          x={240}
          y={y}
          fontSize={15}
          textAnchor="middle"
          fill="var(--coral)"
        >
          {letter}
        </text>
      ))}
      {CHEVRONS.map((y) => (
        <path
          key={y}
          d={`M226 ${y} L240 ${y + 10} L254 ${y} V${y + 8} L240 ${y + 18} L226 ${y + 8} Z`}
          fill="var(--coral)"
          stroke="var(--ink)"
          strokeWidth={1.5}
        />
      ))}

      <rect x={62} y={264} width={356} height={10} fill="var(--ink)" />
      <Bulbs from={[72, 269]} to={[408, 269]} count={18} r={2.4} lit={(index) => index !== 11} />

      <rect
        x={130}
        y={274}
        width={220}
        height={122}
        fill="var(--panel)"
        stroke="var(--ink)"
        strokeWidth={2}
      />

      <Doors x={144} />
      <Doors x={292} />

      <rect
        x={222}
        y={280}
        width={36}
        height={14}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <text className={styles.tag} x={240} y={290} fontSize={6} textAnchor="middle">
        TICKETS
      </text>
      <path
        d="M206 312 L214 298 L266 298 L274 312 Z"
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={212}
        y={312}
        width={56}
        height={84}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <rect
        x={220}
        y={324}
        width={40}
        height={38}
        fill="var(--panel-tile)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={216}
        y={362}
        width={48}
        height={6}
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <circle cx={240} cy={343} r={4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />

      <rect
        x={98}
        y={304}
        width={26}
        height={36}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <rect x={102} y={308} width={18} height={20} fill="var(--coral)" />
      <rect
        x={356}
        y={304}
        width={26}
        height={36}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <rect x={360} y={308} width={18} height={20} fill="var(--blue)" />

      <rect x={0} y={396} width={480} height={3} fill="var(--line)" />
    </svg>
  );
}
