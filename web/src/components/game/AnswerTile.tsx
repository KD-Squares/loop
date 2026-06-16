"use client";

// AnswerTile — the four classic answer shapes/colours, distinguished by BOTH
// shape and colour so they are colour-blind safe:
//   index 0 -> red triangle
//   index 1 -> blue diamond
//   index 2 -> yellow circle
//   index 3 -> green square
// True/False uses the first two. Large tap targets for mobile players.

import type { ReactNode } from "react";

const STYLES = [
  { bg: "bg-tile-red", shape: "triangle", label: "Triangle" },
  { bg: "bg-tile-blue", shape: "diamond", label: "Diamond" },
  { bg: "bg-tile-yellow", shape: "circle", label: "Circle" },
  { bg: "bg-tile-green", shape: "square", label: "Square" },
] as const;

function ShapeIcon({ shape }: { shape: string }): ReactNode {
  const common = "h-7 w-7 fill-white";
  switch (shape) {
    case "triangle":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <polygon points="12,3 22,21 2,21" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <polygon points="12,2 22,12 12,22 2,12" />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={common} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
  }
}

export default function AnswerTile({
  index,
  text,
  onClick,
  disabled,
  state = "idle",
}: {
  index: number;
  text: string;
  onClick?: () => void;
  disabled?: boolean;
  // idle = selectable; selected = the player's pick; correct/wrong = after reveal
  state?: "idle" | "selected" | "correct" | "wrong" | "dim";
}) {
  const style = STYLES[index % 4];
  const stateRing =
    state === "selected"
      ? "ring-4 ring-white scale-[0.98]"
      : state === "correct"
      ? "ring-4 ring-white"
      : "";
  const stateOpacity = state === "dim" || state === "wrong" ? "opacity-50" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[88px] w-full items-center gap-3 rounded-xl ${style.bg} px-4 py-4 text-left text-lg font-bold text-white shadow-md transition
        enabled:hover:brightness-105 disabled:cursor-default ${stateRing} ${stateOpacity}`}
    >
      <span className="shrink-0">
        <ShapeIcon shape={style.shape} />
      </span>
      <span className="flex-1">{text}</span>
      {state === "correct" && <span className="text-2xl">✓</span>}
      {state === "wrong" && <span className="text-2xl">✕</span>}
    </button>
  );
}
