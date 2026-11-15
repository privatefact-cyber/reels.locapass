/**
 * 言語を切り替えるとページを読み込み直すため、画面の状態(表示の切り替え・絞り込み・開いているリール/写真)が消えていた。
 * 切り替える直前に、各画面が状態を一時保存(sessionStorage)し、読み込み直したあとに戻す。
 * 同じページでの言語切り替えのときだけ使い、60秒を過ぎたものは捨てる。
 */
export const LOCALE_CHANGE_EVENT = "lp:locale-will-change";
const TTL_MS = 60_000;

function k(name: string): string {
  return `lp-restore:${name}`;
}

export function saveRestore(name: string, value: unknown): void {
  try {
    sessionStorage.setItem(k(name), JSON.stringify({ at: Date.now(), value, path: window.location.pathname.replace(/^\/(en|zh|ar)(?=\/|$)/, "") || "/" }));
  } catch {
    /* 保存できなくても、通常どおり表示するだけ */
  }
}

export function takeRestore<T>(name: string): T | null {
  try {
    const raw = sessionStorage.getItem(k(name));
    if (!raw) return null;
    sessionStorage.removeItem(k(name));
    const data = JSON.parse(raw) as { at: number; value: T; path: string };
    const here = window.location.pathname.replace(/^\/(en|zh|ar)(?=\/|$)/, "") || "/";
    if (Date.now() - data.at > TTL_MS || data.path !== here) return null;
    return data.value;
  } catch {
    return null;
  }
}
