"use client";

// Small audio manager for the game. Sound effects are one-shots; the background
// music loops. A single mute flag (saved in localStorage) covers everything.
//
// Browsers block audio until the user interacts with the page, so every call
// here is made from inside a click/tap handler (host Start, a tile tap, etc.),
// and any blocked play is caught and ignored.

const SFX = {
  questionStart: "/audio/question-start.wav",
  tick: "/audio/tick.wav",
  lock: "/audio/time-up.wav",
  correct: "/audio/correct.wav",
  wrong: "/audio/wrong.wav",
  finish: "/audio/finish.wav",
  join: "/audio/join.wav",
  tap: "/audio/tap.wav",
} as const;

export type SfxName = keyof typeof SFX;

const KEY = "loop:muted";
let muted = false;
let loaded = false;
let music: HTMLAudioElement | null = null;
let musicWanted = false;
const listeners = new Set<() => void>();

function ensure() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    muted = localStorage.getItem(KEY) === "1";
  } catch {
    /* private mode: default to unmuted */
  }
}

export function isMuted() {
  ensure();
  return muted;
}

export function onMuteChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function toggleMute() {
  ensure();
  muted = !muted;
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (music) {
    if (muted) music.pause();
    else if (musicWanted) music.play().catch(() => {});
  }
  listeners.forEach((l) => l());
}

export function playSfx(name: SfxName, volume = 1) {
  ensure();
  if (muted || typeof window === "undefined") return;
  try {
    const a = new Audio(SFX[name]);
    a.volume = Math.max(0, Math.min(1, volume));
    a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function startMusic(volume = 0.32) {
  ensure();
  if (typeof window === "undefined") return;
  musicWanted = true;
  if (!music) {
    music = new Audio("/audio/music-loop.wav");
    music.loop = true;
    music.volume = volume;
  }
  if (!muted) music.play().catch(() => {});
}

export function stopMusic() {
  musicWanted = false;
  if (music) {
    music.pause();
    music.currentTime = 0;
  }
}
