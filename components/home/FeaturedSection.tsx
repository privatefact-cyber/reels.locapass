"use client";

import { useEffect, useState } from "react";
import { FeaturedHero, type FeaturedShop } from "@/components/home/FeaturedHero";
import { FeaturedShowcase } from "@/components/home/FeaturedShowcase";

/** ×で消したら、そのブラウザタブのセッション中は出さない(次のタブ・翌日の訪問では復活する)。 */
const DISMISS_KEY = "luxela_featured_dismissed";

/**
 * トップのFEATURED枠(ヒーロー+横スクロールカルーセル)をまとめる。
 * サーバー(app/page.tsx)からはこの1つだけを渡す。非表示の可否をここで一元管理する。
 */
export function FeaturedSection({ shops }: { shops: FeaturedShop[] }) {
  const [hidden, setHidden] = useState(false);

  // SSR/初回描画とサーバーの出力を一致させるため、sessionStorageの参照は
  // マウント後(useEffect)にだけ行う(ここで初期状態を決めるとハイドレーション不整合になる)。
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setHidden(true);
    } catch {
      // プライベートモード等でsessionStorageが使えない環境では、常に表示のままでよい。
    }
  }, []);

  if (shops.length === 0 || hidden) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 保存できなくても閉じる操作自体は反映する(次回また出るだけ)。
    }
    setHidden(true);
  }

  return (
    <>
      <FeaturedHero shops={shops} onDismiss={handleDismiss} />
      <FeaturedShowcase shops={shops} />
    </>
  );
}
