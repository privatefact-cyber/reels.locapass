"use client";

import { useSyncExternalStore } from "react";

// 字幕(テロップ)の表示/非表示。ミュートの好みと同じく、一度切り替えたら全リールで共有し端末に記憶する。
const STORAGE_KEY = "locapass:reel-captions";

let captionsOn = true;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "0") captionsOn = false;
  } catch {
    // localStorageが使えなくても、このセッション中の共有は動く。
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  hydrate();
  return captionsOn;
}

function getServerSnapshot() {
  return true;
}

export function setReelCaptionsPreference(on: boolean) {
  hydrate();
  if (captionsOn === on) return;
  captionsOn = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // noop
  }
  listeners.forEach((listener) => listener());
}

/** 全ReelCardで共有される「字幕を出すかどうか」。 */
export function useReelCaptionsPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [on, setReelCaptionsPreference];
}
