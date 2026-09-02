import type { MediaTitle } from "../../../domain/catalog";
import { UsherFigure } from "../../usher/UsherMark";
import { Arch, BoardText, boardLines, Bulbs, facadeLabel } from "./parts";

import styles from "./CinemaFacade.module.css";

const BOARD = { x: 232, width: 336, fontSize: 12 };
const STRAGGLERS = new Set([3, 9, 15]);
const DOORS = [210, 240, 270];
const STARS: [number, number][] = [
  [60, 30],
  [140, 18],
  [330, 26],
  [400, 52],
];
const TORCH: [number, number] = [308, 348];

function Star({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 3} ${y} H${x + 3} M${x} ${y - 3} V${y + 3}`}
      stroke="var(--acid)"
      strokeWidth={1.2}
    />
  );
}

export function LastShowingFacade({ showing }: { showing: MediaTitle[] }) {
  const lines = boardLines(showing, 3, BOARD.width, BOARD.fontSize);

  return (
    <svg
      className={styles.facade}
      viewBox="0 0 480 420"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg is the picture, role=img is the standard pattern
      role="img"
      aria-label={facadeLabel("The Last Showing", lines)}
    >
      <circle
        cx={430}
        cy={38}
        r={14}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <circle cx={425} cy={34} r={2.5} fill="var(--paper-line)" />
      <circle cx={435} cy={43} r={1.8} fill="var(--paper-line)" />
      {STARS.map(([x, y]) => (
        <Star key={`${x}-${y}`} x={x} y={y} />
      ))}

      <rect x={68} y={78} width={344} height={322} fill="var(--blue)" />
      <rect
        x={60}
        y={70}
        width={344}
        height={326}
        fill="var(--panel-raised)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <rect
        x={52}
        y={62}
        width={360}
        height={10}
        fill="var(--ink)"
        stroke="var(--line)"
        strokeWidth={1}
      />

      <Arch cx={104} top={92} width={22} height={34} fill="var(--ink)" stroke="var(--line)" />
      <Arch cx={360} top={92} width={22} height={34} fill="var(--ink)" stroke="var(--line)" />

      <text
        className={styles.neon}
        x={232}
        y={118}
        fontSize={24}
        letterSpacing={7}
        textAnchor="middle"
      >
        <tspan className={styles.flicker}>M</tspan>
        <tspan>ARQUEE</tspan>
      </text>

      <rect
        x={44}
        y={140}
        width={376}
        height={96}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <rect x={54} y={150} width={356} height={76} fill="var(--paper)" />
      <Bulbs from={[52, 145]} to={[412, 145]} count={19} lit={(index) => STRAGGLERS.has(index)} />
      <Bulbs
        from={[52, 231]}
        to={[412, 231]}
        count={19}
        lit={(index) => STRAGGLERS.has(index + 1)}
      />

      <text className={styles.head} x={62} y={162} fontSize={6.5}>
        NOW SHOWING
      </text>
      <text className={styles.head} x={402} y={162} fontSize={6.5} textAnchor="end">
        ADM. ONE
      </text>
      <line x1={62} x2={402} y1={167} y2={167} stroke="var(--paper-line)" strokeWidth={1} />
      <BoardText
        lines={lines}
        slots={3}
        x={BOARD.x}
        y={185}
        step={16}
        fontSize={BOARD.fontSize}
        width={BOARD.width}
      />

      {DOORS.map((cx) => (
        <g key={cx}>
          <Arch cx={cx} top={318} width={26} height={78} fill="var(--ink)" stroke="var(--line)" />
          <line x1={cx} x2={cx} y1={331} y2={396} stroke="var(--line)" strokeWidth={1} />
          <line x1={cx - 13} x2={cx + 13} y1={352} y2={352} stroke="var(--line)" strokeWidth={1} />
          <line x1={cx - 13} x2={cx + 13} y1={374} y2={374} stroke="var(--line)" strokeWidth={1} />
        </g>
      ))}
      <rect
        x={228}
        y={344}
        width={24}
        height={12}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <text className={styles.tag} x={240} y={352.5} fontSize={5} textAnchor="middle">
        CLOSED
      </text>

      <rect
        x={94}
        y={300}
        width={30}
        height={42}
        fill="var(--ink)"
        stroke="var(--line)"
        strokeWidth={1.5}
      />
      <rect x={99} y={305} width={20} height={26} fill="var(--panel-tile)" />
      <rect
        x={356}
        y={300}
        width={30}
        height={42}
        fill="var(--ink)"
        stroke="var(--line)"
        strokeWidth={1.5}
      />
      <rect x={361} y={305} width={20} height={26} fill="var(--panel-tile)" />

      <rect x={0} y={396} width={480} height={3} fill="var(--line)" />

      <path
        d={`M${TORCH[0]} ${TORCH[1]} L96 154 L266 154 Z`}
        className={styles.beam}
        style={{ transformOrigin: `${TORCH[0]}px ${TORCH[1]}px` }}
      />
      <g transform="translate(420 294) scale(-0.2 0.2)">
        <UsherFigure face="idle" />
      </g>
    </svg>
  );
}
