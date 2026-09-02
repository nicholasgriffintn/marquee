import type { MediaTitle } from "../../../domain/catalog";
import { Arch, BoardText, boardLines, Bulbs, facadeLabel } from "./parts";

import styles from "./CinemaFacade.module.css";

const COLUMNS = [128, 184, 240, 296, 352];
const ROWS = [118, 176, 234];
const LIT = new Set(["176-184", "118-296", "234-352"]);
const DENTILS = Array.from({ length: 17 }, (_, index) => 72 + index * 20);
const DOORS = [210, 240, 270];
const BOARD = { x: 240, width: 356, fontSize: 11 };

function Turret({ cx }: { cx: number }) {
  return (
    <g>
      <rect
        x={cx - 15}
        y={22}
        width={30}
        height={40}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <path
        d={`M${cx - 15} 22 a15 15 0 0 1 30 0 Z`}
        fill="var(--blue)"
        stroke="var(--ink)"
        strokeWidth={3}
      />
      <line x1={cx} x2={cx} y1={8} y2={2} stroke="var(--ink)" strokeWidth={2} />
      <circle cx={cx} cy={4} r={3} fill="var(--acid)" stroke="var(--ink)" strokeWidth={1.5} />
    </g>
  );
}

export function BudapestFacade({ showing }: { showing: MediaTitle[] }) {
  const lines = boardLines(showing, 3, BOARD.width, BOARD.fontSize);

  return (
    <svg
      className={styles.facade}
      viewBox="0 0 480 420"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg is the picture, role=img is the standard pattern
      role="img"
      aria-label={facadeLabel("The Budapest", lines)}
    >
      <rect x={78} y={68} width={340} height={332} fill="var(--blue)" />
      <rect
        x={70}
        y={60}
        width={340}
        height={336}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />

      <line x1={150} x2={330} y1={50} y2={50} stroke="var(--line)" strokeWidth={1.5} />
      <text
        className={styles.serif}
        x={240}
        y={46}
        fontSize={17}
        letterSpacing={6}
        textAnchor="middle"
        fill="var(--paper-deep)"
      >
        THE MARQUEE
      </text>

      <Turret cx={91} />
      <Turret cx={389} />

      <rect x={62} y={54} width={356} height={10} fill="var(--ink)" />
      {DENTILS.map((x) => (
        <rect key={x} x={x} y={64} width={8} height={6} fill="var(--ink)" />
      ))}

      <line x1={70} x2={410} y1={168} y2={168} stroke="var(--ink)" strokeWidth={1.5} />
      <line x1={70} x2={410} y1={226} y2={226} stroke="var(--ink)" strokeWidth={1.5} />

      {ROWS.map((top) =>
        COLUMNS.map((cx) => (
          <g key={`${top}-${cx}`}>
            <Arch
              cx={cx}
              top={top}
              width={22}
              height={32}
              fill={LIT.has(`${top}-${cx}`) ? "var(--acid)" : "var(--panel-tile)"}
            />
            <line x1={cx} x2={cx} y1={top + 11} y2={top + 32} stroke="var(--ink)" strokeWidth={1} />
            <rect
              x={cx - 16}
              y={top - 7}
              width={32}
              height={7}
              fill="var(--coral)"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          </g>
        )),
      )}

      <rect x={48} y={288} width={400} height={82} fill="var(--blue)" />
      <rect x={40} y={280} width={400} height={82} fill="var(--ink)" />
      <rect x={52} y={292} width={376} height={60} fill="var(--paper)" />
      <Bulbs from={[50, 286]} to={[430, 286]} count={20} />
      <Bulbs from={[50, 357]} to={[430, 357]} count={20} lit={(index) => index !== 13} />

      <text className={styles.head} x={60} y={302} fontSize={6.5}>
        NOW SHOWING
      </text>
      <text className={styles.head} x={420} y={302} fontSize={6.5} textAnchor="end">
        ADM. ONE
      </text>
      <line x1={60} x2={420} y1={306} y2={306} stroke="var(--paper-line)" strokeWidth={1} />
      <BoardText
        lines={lines}
        slots={3}
        x={BOARD.x}
        y={320}
        step={14}
        fontSize={BOARD.fontSize}
        width={BOARD.width}
      />

      {DOORS.map((cx) => (
        <Arch key={cx} cx={cx} top={362} width={24} height={34} fill="var(--panel-tile)" />
      ))}
      <line x1={240} x2={240} y1={374} y2={396} stroke="var(--ink)" strokeWidth={1} />

      <rect
        x={96}
        y={366}
        width={22}
        height={26}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <rect x={100} y={370} width={14} height={12} fill="var(--coral)" />
      <rect
        x={362}
        y={366}
        width={22}
        height={26}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <rect x={366} y={370} width={14} height={12} fill="var(--blue)" />

      <rect x={0} y={396} width={480} height={3} fill="var(--line)" />
      <path
        d="M198 396 H282 L306 418 H174 Z"
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
    </svg>
  );
}
