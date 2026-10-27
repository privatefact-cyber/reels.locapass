"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StaffDmButton } from "@/components/StaffDmButton";

type Card = { nickname: string; avatar_url: string | null };

/**
 * 写真の投稿がない会員のプロフィール。投稿者ページは投稿がないと存在しないため、フォロー通知などで
 * 「関係のある相手」(フォロー/被フォロー/DMあり)にだけ、名前とアイコンを出す(RPC側で判定)。
 * フォローとメッセージは、DMボタンのフォロー案内から行える。
 */
export function RelatedMemberProfile({ memberId }: { memberId: string }) {
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "guest" | "hidden" | "ok">("loading");
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setState("guest");
        return;
      }
      const { data: rows } = await supabase.rpc("locapass_member_card", { p_member_id: memberId });
      const row = rows?.[0];
      if (!row) {
        setState("hidden");
        return;
      }
      setCard(row);
      setState("ok");
    });
  }, [memberId]);

  if (state === "loading") return <p className="px-4 text-sm text-tone-500">読み込み中...</p>;

  if (state === "guest") {
    return (
      <div className="px-4 text-sm text-tone-300">
        <p>このページを見るにはログインが必要です。</p>
        <Link href={`/mypage/login?redirect=${encodeURIComponent(pathname ?? "/photo")}`} className="mt-2 inline-block text-hl-400">
          ログインする
        </Link>
      </div>
    );
  }

  if (state === "hidden" || !card) {
    return <p className="px-4 text-sm text-tone-500">このページは見つかりませんでした。</p>;
  }

  return (
    <header className="flex items-center gap-4 px-4">
      {card.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-tone-800 text-2xl text-tone-300">
          {card.nickname.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="truncate text-lg font-medium text-main">{card.nickname}</h1>
        <p className="text-xs text-tone-500">まだ写真の投稿はありません</p>
        <StaffDmButton userId={memberId} staffName={card.nickname} />
      </div>
    </header>
  );
}
