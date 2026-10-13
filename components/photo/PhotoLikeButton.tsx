"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { usePhotoViewer } from "@/components/photo/useViewer";

export function PhotoLikeButton({ postId, initialCount }: { postId: string; initialCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const viewer = usePhotoViewer();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (viewer) setLiked(viewer.likedPostIds.has(postId));
  }, [viewer, postId]);

  async function toggle() {
    if (busy || !viewer) return;
    if (!viewer.userId) {
      router.push(`/mypage/login?redirect=${encodeURIComponent(pathname ?? "/photo")}`);
      return;
    }
    // 押した瞬間に見た目を切り替え(楽観的更新)、失敗したら戻す。
    const prevLiked = liked;
    const prevCount = count;
    setBusy(true);
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    try {
      const res = await fetch(`/api/photo/posts/${postId}/like`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { liked: boolean; likeCount: number };
      setLiked(data.liked);
      setCount(data.likeCount);
      if (data.liked) viewer.likedPostIds.add(postId);
      else viewer.likedPostIds.delete(postId);
    } catch {
      setLiked(prevLiked);
      setCount(prevCount);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "いいねを取り消す" : "いいね"}
      className={`flex items-center gap-1 transition ${liked ? "text-rose-400" : "text-tone-300 hover:text-main"}`}
    >
      <Heart size={18} className={liked ? "fill-rose-400" : ""} />
      {count}
    </button>
  );
}
