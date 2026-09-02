import type { ReactElement } from "react";

import type { UsherFace } from "../../domain/usher";
import { classNames } from "../../lib/class-names";

import styles from "./UsherMark.module.css";

const LIMBS = "M124 300q-34 12-52 32M394 300q30-6 51 0M219 372l-33 84M293 372l33 84";

const FACES: Record<UsherFace, ReactElement> = {
  idle: (
    <g>
      <path d="M176 141q28-7 56 1M280 142q28-8 56-1" strokeWidth="8" />
      <ellipse cx="204" cy="187" rx="26" ry="21" fill="#f3f0e7" strokeWidth="8" />
      <ellipse cx="308" cy="187" rx="26" ry="21" fill="#f3f0e7" strokeWidth="8" />
      <circle cx="207" cy="188" r="10" fill="#11130f" stroke="none" />
      <circle cx="311" cy="188" r="10" fill="#11130f" stroke="none" />
      <circle cx="203" cy="183" r="3.5" fill="#f3f0e7" stroke="none" />
      <circle cx="307" cy="183" r="3.5" fill="#f3f0e7" stroke="none" />
      <path d="M240 243q16-2 32-6" strokeWidth="10" />
    </g>
  ),
  thinking: (
    <g>
      <path d="M176 146q28-10 56-2M280 132q28-6 56 4" strokeWidth="8" />
      <ellipse cx="204" cy="187" rx="26" ry="21" fill="#f3f0e7" strokeWidth="8" />
      <ellipse cx="308" cy="187" rx="26" ry="21" fill="#f3f0e7" strokeWidth="8" />
      <circle cx="197" cy="180" r="10" fill="#11130f" stroke="none" />
      <circle cx="301" cy="180" r="10" fill="#11130f" stroke="none" />
      <path d="M243 245q13 3 26-3" strokeWidth="10" />
    </g>
  ),
  pleased: (
    <g>
      <path d="M178 194q26-26 52 0M282 194q26-26 52 0" strokeWidth="10" />
      <path d="M236 238q20 14 40 0" strokeWidth="10" />
    </g>
  ),
  unimpressed: (
    <g>
      <path d="M167 150h34M311 150h34" strokeWidth="13" />
      <path
        d="M171 178c4 25 15 37 34 37 19 0 30-12 34-37M273 178c4 25 15 37 34 37 19 0 30-12 34-37"
        fill="#f3f0e7"
        strokeWidth="9"
      />
      <path
        d="M185 178c2 17 9 25 20 25s18-8 20-25M287 178c2 17 9 25 20 25s18-8 20-25"
        fill="#11130f"
        strokeWidth="4"
      />
      <path d="M239 239h34" strokeWidth="10" />
    </g>
  ),
  dormant: (
    <g>
      <path d="M178 186q26 20 52 0M282 186q26 20 52 0" strokeWidth="9" />
      <path d="M242 243h28" strokeWidth="10" />
    </g>
  ),
};

export function UsherFigure({
  face = "idle",
  crop = "full",
}: {
  face?: UsherFace;
  crop?: "full" | "head";
}) {
  return (
    <g fill="none" stroke="#11130f" strokeLinecap="round" strokeLinejoin="round">
      {crop === "full" && (
        <g>
          <path d={LIMBS} strokeWidth="36" />
          <path d={LIMBS} stroke="#f3f0e7" strokeWidth="20" />
          <g transform="translate(445 300) rotate(-20)">
            <path d="M72-30 122-70v140L72 30z" fill="#c9f35d" strokeWidth="10" />
            <path d="M46-27h30v54H46z" fill="#11130f" strokeWidth="8" />
            <path d="M-4-21h54v42H-4z" fill="#ff6e56" strokeWidth="11" />
            <circle cx="4" cy="0" r="16" fill="#f3f0e7" strokeWidth="10" />
          </g>
          <circle cx="68" cy="336" r="20" fill="#f3f0e7" strokeWidth="11" />
          <path
            d="M143 472c8-26 27-37 57-32 17 3 29 14 34 32zM278 472c5-18 17-29 34-32 30-5 49 6 57 32z"
            fill="#f3f0e7"
            strokeWidth="18"
          />
        </g>
      )}
      <path
        d="M95 101 184 99l72 101 72-101 89 2-30 267h-76l10-134-65 83-65-83 10 134h-76z"
        fill="#f3f0e7"
        strokeWidth="22"
      />
      <path d="m213 292 43 25 43-25-8 71-35 27-35-27z" fill="#ff6e56" strokeWidth="14" />
      <g fill="#c9f35d" strokeWidth="7">
        <circle cx="128" cy="142" r="10" />
        <circle cx="137" cy="197" r="10" />
        <circle cx="143" cy="253" r="10" />
        <circle cx="148" cy="310" r="10" />
        <circle cx="384" cy="142" r="10" />
        <circle cx="375" cy="197" r="10" />
        <circle cx="369" cy="253" r="10" />
        <circle cx="364" cy="310" r="10" />
        <circle cx="256" cy="338" r="8" />
      </g>
      {FACES[face]}
    </g>
  );
}

export function UsherMark({
  face = "idle",
  crop = "full",
  className,
}: {
  face?: UsherFace;
  crop?: "full" | "head";
  className?: string;
}) {
  return (
    <svg
      className={classNames(styles.mark, className)}
      viewBox={crop === "head" ? "108 98 296 200" : "0 0 600 512"}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the svg paths are the image, role=img is the standard pattern
      role="img"
      aria-label="The Usher"
    >
      <UsherFigure face={face} crop={crop} />
    </svg>
  );
}
