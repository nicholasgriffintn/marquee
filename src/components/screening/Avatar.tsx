import type { ReactElement } from "react";

import type { AvatarHat, AvatarMood, AvatarProp, AvatarSpec } from "../../domain/avatars";
import { classNames } from "../../lib/class-names";

import styles from "./Avatar.module.css";

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const ACID = "var(--acid)";
const CORAL = "var(--coral)";
const BLUE = "var(--blue)";

const FACES: Record<AvatarMood, ReactElement> = {
  idle: (
    <g>
      <circle cx={27} cy={27} r={1.8} fill={INK} />
      <circle cx={37} cy={27} r={1.8} fill={INK} />
      <path d="M28 34 q4 2.5 8 0" stroke={INK} strokeWidth={1.6} />
    </g>
  ),
  pleased: (
    <g>
      <path d="M24 27 q3 -3 6 0 M34 27 q3 -3 6 0" stroke={INK} strokeWidth={1.8} />
      <path d="M27 33 q5 5 10 0" stroke={INK} strokeWidth={1.8} />
    </g>
  ),
  dormant: (
    <g>
      <path d="M24 27 h6 M34 27 h6" stroke={INK} strokeWidth={1.8} />
      <path d="M29 34 h6" stroke={INK} strokeWidth={1.8} />
    </g>
  ),
  thinking: (
    <g>
      <path d="M24 22 q3 -2 6 0" stroke={INK} strokeWidth={1.6} />
      <circle cx={26} cy={27} r={1.8} fill={INK} />
      <circle cx={36} cy={26} r={1.8} fill={INK} />
      <path d="M29 34 q4 -1 7 1" stroke={INK} strokeWidth={1.6} />
    </g>
  ),
};

function Hat({ kind, colour }: { kind: AvatarHat; colour: string }) {
  switch (kind) {
    case "pillbox":
      return (
        <g>
          <rect x={22} y={7} width={20} height={11} fill={colour} stroke={INK} strokeWidth={2} />
          <circle cx={32} cy={12.5} r={1.8} fill={ACID} />
          <path d="M22 18 q-5 8 -1 16" stroke={INK} strokeWidth={1.4} />
        </g>
      );
    case "peaked":
      return (
        <g>
          <path d="M18 18 h28 v-5 q-14 -9 -28 0 z" fill={colour} stroke={INK} strokeWidth={2} />
          <rect x={15} y={17} width={34} height={3.5} fill={INK} />
          <circle cx={32} cy={13} r={2} fill={ACID} stroke={INK} strokeWidth={1} />
        </g>
      );
    case "beret":
      return (
        <g>
          <path d="M16 19 q16 -14 32 0 q-16 4 -32 0 z" fill={colour} stroke={INK} strokeWidth={2} />
          <circle cx={37} cy={9} r={1.6} fill={INK} />
        </g>
      );
    case "flatcap":
      return (
        <g>
          <path d="M18 19 q14 -11 28 0 z" fill={colour} stroke={INK} strokeWidth={2} />
          <path d="M14 19 h30 l5 3 h-38 z" fill={colour} stroke={INK} strokeWidth={2} />
        </g>
      );
    default:
      return null;
  }
}

function Prop({ kind }: { kind: AvatarProp }) {
  switch (kind) {
    case "key":
      return (
        <g>
          <circle cx={52} cy={46} r={3.2} fill="none" stroke={ACID} strokeWidth={2.2} />
          <path d="M52 49 v9 M52 54 h3 M52 57 h2.5" stroke={ACID} strokeWidth={2.2} />
        </g>
      );
    case "torch":
      return (
        <g>
          <rect x={49} y={46} width={5} height={11} fill={CORAL} stroke={INK} strokeWidth={1.4} />
          <path d="M49 46 L54 46 L60 34 L43 34 Z" fill={ACID} opacity={0.85} />
        </g>
      );
    case "ticket":
      return (
        <g transform="rotate(-18 52 52)">
          <rect x={45} y={49} width={14} height={7} fill={PAPER} stroke={CORAL} strokeWidth={1.6} />
          <path d="M50 49 v7" stroke={CORAL} strokeWidth={1} strokeDasharray="1.5 1.5" />
        </g>
      );
    case "brush":
      return (
        <g>
          <path d="M52 58 L52 44" stroke={INK} strokeWidth={2} />
          <path d="M49 44 h6 v-5 q-3 -2 -6 0 z" fill={BLUE} stroke={INK} strokeWidth={1.4} />
        </g>
      );
    case "tray":
      return (
        <g>
          <ellipse cx={53} cy={49} rx={7} ry={2.2} fill={PAPER} stroke={INK} strokeWidth={1.4} />
          <path d="M49 49 q4 -8 8 0" fill={CORAL} stroke={INK} strokeWidth={1.4} />
          <path d="M53 49 v9" stroke={INK} strokeWidth={2} />
        </g>
      );
    case "none":
      return null;
    default:
      return null;
  }
}

export function Avatar({
  avatar,
  size = 40,
  className,
  decorative = false,
}: {
  avatar: AvatarSpec;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      className={classNames(styles.avatar, className)}
      viewBox="0 0 64 64"
      style={{ width: size, height: size }}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg is the picture, role=img is the standard pattern
      role="img"
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : avatar.name}
    >
      <path
        d="M9 64 C9 49 20 44 32 44 C44 44 55 49 55 64 Z"
        fill={avatar.coat}
        stroke={INK}
        strokeWidth={2}
      />
      <path d="M26 44 L32 52 L38 44 Z" fill={PAPER} stroke={INK} strokeWidth={1.4} />
      <circle cx={32} cy={28} r={14} fill={PAPER} stroke={INK} strokeWidth={2} />
      {FACES[avatar.mood]}
      <Hat kind={avatar.hat} colour={avatar.hatColour} />
      <Prop kind={avatar.prop} />
    </svg>
  );
}
