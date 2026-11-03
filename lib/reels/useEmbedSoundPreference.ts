"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "embedSoundOn";
const EVENT = "embed-sound-change";

/**
 * 外部動画(YouTube/TikTok)の「音を出す」を、このタブを開いている間は保つ。
 * 一度スピーカーで音を出したら、次の外部動画のカードも音ありで始める(毎回押し直さなくてよい)。
 * タブを閉じたら元(無音)に戻る。自動再生は必ず無音で始め、始まったあとで音を入れる(ブラウザの自動再生の制限に合わせるため)。
 */
export function useEmbedSoundPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setOn(sessionStorage.getItem(KEY) === "1");
      } catch {
        /* 保存できない環境では、カードごとに切り替える */
      }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      sessionStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* 同上 */
    }
    setOn(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [on, set];
}
