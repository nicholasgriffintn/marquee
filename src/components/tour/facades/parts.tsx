import type { MediaTitle } from "../../../domain/catalog";
import { classNames } from "../../../lib/class-names";
import { truncateLabel } from "../../../lib/string";

import styles from "./CinemaFacade.module.css";

const MONO_ADVANCE = 0.62;

export type Point = [number, number];

export function boardLines(
  showing: MediaTitle[],
  count: number,
  width: number,
  fontSize: number,
  from = 0,
) {
  const maxChars = Math.floor(width / (fontSize * MONO_ADVANCE));

  return showing
    .slice(from, from + count)
    .map((item) => truncateLabel(item.title.toUpperCase(), maxChars));
}

export function facadeLabel(name: string, lines: string[]) {
  return lines.length > 0
    ? `${name}. Now showing: ${lines.join(", ")}.`
    : `${name}. The board is blank tonight.`;
}

export function Bulbs({
  from,
  to,
  count,
  r = 2.6,
  lit,
}: {
  from: Point;
  to: Point;
  count: number;
  r?: number;
  lit?: (index: number) => boolean;
}) {
  const steps = Math.max(count - 1, 1);

  return (
    <g aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <circle
          key={index}
          cx={from[0] + ((to[0] - from[0]) * index) / steps}
          cy={from[1] + ((to[1] - from[1]) * index) / steps}
          r={r}
          className={classNames(styles.bulb, lit && !lit(index) && styles.dead)}
        />
      ))}
    </g>
  );
}

export function BoardText({
  lines,
  slots,
  x,
  y,
  step,
  fontSize,
  width,
  fills,
}: {
  lines: string[];
  slots: number;
  x: number;
  y: number;
  step: number;
  fontSize: number;
  width: number;
  fills?: string[];
}) {
  return (
    <g>
      {Array.from({ length: slots }, (_, index) => {
        const line = lines[index];
        const baseline = y + index * step;

        if (line === undefined) {
          return (
            <line
              key={index}
              className={styles.placeholder}
              x1={x - width * 0.3}
              x2={x + width * 0.3}
              y1={baseline - fontSize * 0.35}
              y2={baseline - fontSize * 0.35}
            />
          );
        }

        return (
          <text
            key={index}
            className={styles.board}
            x={x}
            y={baseline}
            fontSize={fontSize}
            textAnchor="middle"
            fill={fills?.[index % (fills.length || 1)]}
          >
            {line}
          </text>
        );
      })}
    </g>
  );
}

export function Arch({
  cx,
  top,
  width,
  height,
  fill,
  stroke = "var(--ink)",
  strokeWidth = 2,
}: {
  cx: number;
  top: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const radius = width / 2;

  return (
    <path
      d={`M${cx - radius} ${top + radius} a${radius} ${radius} 0 0 1 ${width} 0 V${top + height} H${cx - radius} Z`}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}

export function RoomTag({ x, y, children }: { x: number; y: number; children: string }) {
  const width = children.length * 3.4 + 8;

  return (
    <g aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={width}
        height={9}
        fill="var(--acid)"
        stroke="var(--ink)"
        strokeWidth={1}
      />
      <text className={styles.tag} x={x + width / 2} y={y + 6.6} fontSize={5} textAnchor="middle">
        {children}
      </text>
    </g>
  );
}
