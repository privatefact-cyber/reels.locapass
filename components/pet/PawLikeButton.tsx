"use client";

import { useState, useTransition } from "react";
import { togglePetDiaryLike } from "@/app/pet/actions";

/** 肉球(いいね)。未ログインならログインへ */
export function PawLikeButton({ entryId, initialLiked, initialCount, loggedIn, size = "sm" }: { entryId: string; initialLiked: boolean; initialCount: number; loggedIn: boolean; size?: "sm" | "lg" }) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pop, setPop] = useState(false);
  const [pending, start] = useTransition();

  function press(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!loggedIn) {
      location.href = `/pet/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    // 押した瞬間に見た目を変え、結果で合わせる
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    if (next) {
      setPop(true);
      setTimeout(() => setPop(false), 450);
    }
    start(async () => {
      const res = await togglePetDiaryLike(entryId);
      if (res.ok) {
        setLiked(res.liked);
        setCount(res.count);
      } else {
        setLiked(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    });
  }

  const big = size === "lg";
  return (
    <button
      type="button"
      onClick={press}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "肉球を取り消す" : "肉球を送る"}
      className={`inline-flex items-center gap-1 rounded-full font-extrabold transition active:scale-90 ${big ? "px-4 py-2 text-base" : "px-2 py-1 text-xs"} ${liked ? "bg-[#FFE3CF] text-[#EE6A36]" : "bg-white/90 text-[#B39C8C]"}`}
    >
      <span className={`inline-block transition-transform ${pop ? "scale-150" : "scale-100"} ${liked ? "" : "grayscale opacity-70"}`} aria-hidden>
        🐾
      </span>
      {count}
    </button>
  );
}
