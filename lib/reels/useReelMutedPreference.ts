"use client";

import { useSyncExternalStore } from "react";

// リールの動画は基本ミュート再生だが、ユーザーが一度でも音声onにしたら
// 「音声の好み」として記憶し、以降スワイプする動画も音声onのまま再生する。
// 各ReelCardインスタンスは独立したReactツリーの葉になるため、Contextではなく
// モジュール外部のストア(useSyncExternalStore)で状態を共有する。
const STORAGE_KEY = "locapass:reel-muted";

let mutedPref = true;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "0") mutedPref = false;
  } catch {
    // プライベートブラウズ等でlocalStorageが使えなくても、このセッション中の共有は動く。
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  hydrate();
  return mutedPref;
}

function getServerSnapshot() {
  return true;
}

export function setReelMutedPreference(muted: boolean) {
  hydrate();
  if (mutedPref === muted) return;
  mutedPref = muted;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // noop
  }
  listeners.forEach((listener) => listener());
}

/** 全ReelCardで共有される「ミュート中かどうか」。一度onにすれば次の動画もonのまま。 */
export function useReelMutedPreference(): [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [muted, setReelMutedPreference];
}
