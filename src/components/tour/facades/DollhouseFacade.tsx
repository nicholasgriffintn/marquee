import type { MediaTitle } from "../../../domain/catalog";
import { UsherFigure } from "../../usher/UsherMark";
import { BoardText, boardLines, Bulbs, facadeLabel, RoomTag } from "./parts";

import styles from "./CinemaFacade.module.css";

const SCREEN = { x: 196, y: 222, width: 116, height: 88, fontSize: 8.5 };
const FOYER_BOARD = { x: 82, y: 222, width: 86, height: 66, fontSize: 7 };
const SEATS = [216, 236, 256, 276, 296, 316, 336, 356];
const HEADS = new Set([236, 276, 336]);
const FRAMES = [
  [70, "var(--coral)"],
  [118, "var(--blue)"],
  [166, "var(--acid)"],
  [214, "var(--coral)"],
  [262, "var(--blue)"],
] as const;
const LAMPS = [100, 180, 260];

function floorAt(x: number) {
  return 392 - ((x - 182) / 254) * 40;
}

export function DollhouseFacade({ showing }: { showing: MediaTitle[] }) {
  const feature = boardLines(showing, 1, SCREEN.width - 12, SCREEN.fontSize);
  const foyer = boardLines(showing, 3, FOYER_BOARD.width - 8, FOYER_BOARD.fontSize, 1);

  return (
    <svg
      className={styles.facade}
      viewBox="0 0 480 420"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg is the picture, role=img is the standard pattern
      role="img"
      aria-label={facadeLabel("The Dollhouse", [...feature, ...foyer])}
    >
      <rect x={48} y={40} width={400} height={360} fill="var(--blue)" />
      <rect
        x={40}
        y={32}
        width={400}
        height={364}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={3}
      />

      <line x1={200} x2={200} y1={6} y2={26} stroke="var(--ink)" strokeWidth={2} />
      <line x1={280} x2={280} y1={6} y2={26} stroke="var(--ink)" strokeWidth={2} />
      <rect
        x={176}
        y={2}
        width={128}
        height={20}
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <text
        className={styles.sans}
        x={240}
        y={16.5}
        fontSize={11}
        letterSpacing={3}
        textAnchor="middle"
      >
        MARQUEE
      </text>
      <rect
        x={396}
        y={8}
        width={22}
        height={18}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <line x1={400} x2={400} y1={26} y2={32} stroke="var(--ink)" strokeWidth={2} />
      <line x1={414} x2={414} y1={26} y2={32} stroke="var(--ink)" strokeWidth={2} />
      <rect x={32} y={26} width={416} height={8} fill="var(--ink)" />

      <rect x={44} y={38} width={272} height={162} fill="var(--paper)" />
      {LAMPS.map((x) => (
        <g key={x}>
          <line x1={x} x2={x} y1={38} y2={52} stroke="var(--ink)" strokeWidth={1.5} />
          <circle cx={x} cy={56} r={5} fill="var(--acid)" stroke="var(--ink)" strokeWidth={1.5} />
        </g>
      ))}
      {FRAMES.map(([x, fill]) => (
        <g key={x}>
          <rect
            x={x}
            y={86}
            width={34}
            height={44}
            fill={fill}
            stroke="var(--ink)"
            strokeWidth={2}
          />
          <rect
            x={x + 6}
            y={92}
            width={22}
            height={32}
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth={1}
          />
          <line x1={x + 10} x2={x + 24} y1={112} y2={112} stroke="var(--ink)" strokeWidth={1.5} />
          <line x1={x + 12} x2={x + 22} y1={117} y2={117} stroke="var(--ink)" strokeWidth={1} />
        </g>
      ))}
      <rect
        x={44}
        y={190}
        width={272}
        height={10}
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <RoomTag x={48} y={42}>
        THE CORRIDOR
      </RoomTag>

      <rect x={316} y={38} width={6} height={162} fill="var(--ink)" />
      <rect x={322} y={38} width={114} height={162} fill="var(--panel)" />
      <rect
        x={336}
        y={62}
        width={60}
        height={40}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <text
        className={styles.serif}
        x={366}
        y={92}
        fontSize={26}
        textAnchor="middle"
        fill="var(--acid)"
      >
        M
      </text>
      <line x1={350} x2={382} y1={70} y2={70} stroke="var(--paper-line)" strokeWidth={1} />
      {[340, 362, 384].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y={172}
            width={8}
            height={18}
            fill="var(--coral)"
            stroke="var(--ink)"
            strokeWidth={1.5}
          />
          <rect
            x={x + 8}
            y={184}
            width={10}
            height={6}
            fill="var(--coral)"
            stroke="var(--ink)"
            strokeWidth={1.5}
          />
        </g>
      ))}
      <rect x={322} y={190} width={114} height={10} fill="var(--panel-raised)" />
      <RoomTag x={326} y={42}>
        THE BACK SCREEN
      </RoomTag>

      <rect x={40} y={200} width={400} height={6} fill="var(--ink)" />

      <rect x={44} y={206} width={132} height={190} fill="var(--paper)" />
      <rect
        x={52}
        y={222}
        width={22}
        height={30}
        fill="var(--blue)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={FOYER_BOARD.x}
        y={FOYER_BOARD.y}
        width={FOYER_BOARD.width}
        height={FOYER_BOARD.height}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <text
        className={styles.head}
        x={FOYER_BOARD.x + FOYER_BOARD.width / 2}
        y={232}
        fontSize={5}
        textAnchor="middle"
      >
        NEXT UP
      </text>
      <line
        x1={FOYER_BOARD.x + 6}
        x2={FOYER_BOARD.x + FOYER_BOARD.width - 6}
        y1={236}
        y2={236}
        stroke="var(--paper-line)"
        strokeWidth={1}
      />
      <BoardText
        lines={foyer}
        slots={3}
        x={FOYER_BOARD.x + FOYER_BOARD.width / 2}
        y={250}
        step={13}
        fontSize={FOYER_BOARD.fontSize}
        width={FOYER_BOARD.width - 8}
      />
      <Bulbs from={[86, 226]} to={[164, 226]} count={7} r={1.8} />
      <g transform="translate(96 314) scale(0.11) translate(-95 -99)">
        <UsherFigure face="pleased" crop="head" />
      </g>
      <rect
        x={82}
        y={344}
        width={72}
        height={48}
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={82}
        y={344}
        width={72}
        height={6}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={144}
        y={322}
        width={20}
        height={24}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={148}
        y={326}
        width={12}
        height={12}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={1}
      />
      <RoomTag x={48} y={210}>
        THE FOYER
      </RoomTag>

      <rect x={176} y={206} width={6} height={190} fill="var(--ink)" />

      <rect x={182} y={206} width={254} height={190} fill="var(--panel)" />
      <path
        d="M182 392 L436 352 L436 396 L182 396 Z"
        fill="var(--panel-raised)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <path
        d={`M376 238 L${SCREEN.x + SCREEN.width} ${SCREEN.y + 4} L${SCREEN.x + SCREEN.width} ${SCREEN.y + SCREEN.height - 4} L376 248 Z`}
        className={styles.projection}
      />
      <rect
        x={SCREEN.x}
        y={SCREEN.y}
        width={SCREEN.width}
        height={SCREEN.height}
        fill="var(--white)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <text
        className={styles.head}
        x={SCREEN.x + SCREEN.width / 2}
        y={SCREEN.y + 14}
        fontSize={5}
        textAnchor="middle"
      >
        NOW PLAYING
      </text>
      <BoardText
        lines={feature}
        slots={1}
        x={SCREEN.x + SCREEN.width / 2}
        y={SCREEN.y + 52}
        step={0}
        fontSize={SCREEN.fontSize}
        width={SCREEN.width - 12}
      />
      <rect
        x={SCREEN.x + 48}
        y={SCREEN.y + 66}
        width={20}
        height={10}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={1}
      />
      {SEATS.map((x) => {
        const base = floorAt(x);

        return (
          <g key={x}>
            {HEADS.has(x) && (
              <circle
                cx={x + 13}
                cy={base - 16}
                r={4}
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth={1.5}
              />
            )}
            <rect
              x={x}
              y={base - 14}
              width={7}
              height={14}
              fill="var(--coral)"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
            <rect
              x={x + 7}
              y={base - 6}
              width={11}
              height={6}
              fill="var(--coral)"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
      <RoomTag x={188} y={210}>
        THE SCREEN
      </RoomTag>

      <rect
        x={376}
        y={206}
        width={60}
        height={58}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <circle
        cx={394}
        cy={226}
        r={6}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <circle
        cx={408}
        cy={226}
        r={6}
        fill="var(--paper-deep)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect x={388} y={232} width={26} height={14} fill="var(--ink)" />
      <rect
        x={378}
        y={236}
        width={10}
        height={8}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <RoomTag x={380} y={210}>
        THE BOOTH
      </RoomTag>

      <rect
        x={38}
        y={340}
        width={8}
        height={56}
        fill="var(--panel-tile)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect
        x={12}
        y={334}
        width={30}
        height={6}
        fill="var(--coral)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />
      <Bulbs from={[16, 343]} to={[38, 343]} count={4} r={1.5} />
      <rect
        x={26}
        y={392}
        width={14}
        height={4}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth={1}
      />
      <line x1={14} x2={14} y1={300} y2={396} stroke="var(--ink)" strokeWidth={3} />
      <rect
        x={8}
        y={290}
        width={12}
        height={12}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      <rect x={0} y={396} width={480} height={3} fill="var(--line)" />
    </svg>
  );
}
