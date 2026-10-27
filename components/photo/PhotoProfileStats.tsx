"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePhotoViewer } from "@/components/photo/useViewer";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { StaffDmButton } from "@/components/StaffDmButton";

type Stats = { postCount: number; likesReceived: number; followerCount: number; followingCount: number };

/** プロフィールの数字(投稿・いいね・フォロワー・フォロー中)と、フォローするボタン。自分のページにはボタンを出さない。 */
export function PhotoProfileStats({ memberId, name, stats }: { memberId: string; name: string; stats: Stats }) {
  const { t } = useLocale();
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
        {item(stats.postCount, t.photo.profilePosts)}
        {item(stats.likesReceived, t.photo.profileLikes)}
        {item(followers, t.photo.profileFollowers)}
        {item(stats.followingCount, t.photo.profileFollowing)}
      </dl>
      {isSelf ? null : (
        <>
        <button
          type="button"
          onClick={toggle}
          disabled={!viewer || busy}
          className={`w-full rounded-full py-1.5 text-xs font-bold tracking-wide transition disabled:opacity-50 ${
            following ? "border border-main/25 text-tone-300 hover:text-main" : "bg-cta-light text-on-cta-gold hover:bg-cta-hover"
          }`}
        >
          {following ? t.photo.profileFollowing : t.photo.follow}
        </button>
        {/* メッセージ: お互いにフォローしているときだけ送れる(未達ならフォロー案内が開く)。 */}
        <StaffDmButton userId={memberId} staffName={name} />
        </>
      )}
    </div>
  );
}
