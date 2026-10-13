"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePhotoViewer } from "@/components/photo/useViewer";

type Stats = { postCount: number; likesReceived: number; followerCount: number; followingCount: number };

/** プロフィールの数字(投稿・いいね・フォロワー・フォロー中)と、フォローするボタン。自分のページにはボタンを出さない。 */
export function PhotoProfileStats({ memberId, stats }: { memberId: string; stats: Stats }) {
  const router = useRouter();
  const pathname = usePathname();
  const viewer = usePhotoViewer();
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(stats.followerCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (viewer) setFollowing(viewer.followingIds.has(memberId));
  }, [viewer, memberId]);

  const isSelf = viewer?.userId === memberId;

  async function toggle() {
    if (busy || !viewer) return;
    if (!viewer.userId) {
      router.push(`/mypage/login?redirect=${encodeURIComponent(pathname ?? "/photo")}`);
      return;
    }
    const prev = following;
    const prevCount = followers;
    setBusy(true);
    setFollowing(!prev);
    setFollowers(prevCount + (prev ? -1 : 1));
    try {
      const res = await fetch(`/api/photo/follow/${memberId}`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { following: boolean; followerCount: number };
      setFollowing(data.following);
      setFollowers(data.followerCount);
      if (data.following) viewer.followingIds.add(memberId);
      else viewer.followingIds.delete(memberId);
    } catch {
      setFollowing(prev);
      setFollowers(prevCount);
    }
    setBusy(false);
  }

  const item = (value: number, label: string) => (
    <div>
      <dd className="text-base font-medium text-main">{value}</dd>
      <dt>{label}</dt>
    </div>
  );

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <dl className="flex gap-5 text-center text-xs text-tone-500">
        {item(stats.postCount, "投稿")}
        {item(stats.likesReceived, "いいね")}
        {item(followers, "フォロワー")}
        {item(stats.followingCount, "フォロー中")}
      </dl>
      {isSelf ? null : (
        <button
          type="button"
          onClick={toggle}
          disabled={!viewer || busy}
          className={`w-full rounded-full py-1.5 text-xs font-bold tracking-wide transition disabled:opacity-50 ${
            following ? "border border-main/25 text-tone-300 hover:text-main" : "bg-cta-light text-on-cta-gold hover:bg-cta-hover"
          }`}
        >
          {following ? "フォロー中" : "フォローする"}
        </button>
      )}
    </div>
  );
}
