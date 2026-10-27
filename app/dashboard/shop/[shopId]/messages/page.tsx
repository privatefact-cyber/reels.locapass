import { notFound } from "next/navigation";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { ShopMessageForm } from "./ShopMessageForm";

/**
 * LUXELA本家のお客様へのメッセージ画面(app/dashboard/messages/page.tsx)と同じ画面。
 * 送信先のお気に入り登録者は locapass_shop_favorites(DB関数 locapass_list_shop_favorite_users)、
 * 送信は locapass_notifications(DB関数 locapass_send_shop_message)につないである。
 */
export default async function LocapassShopMessagesPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  const { data: favorites } = await supabase.rpc("locapass_list_shop_favorite_users", { p_shop_id: shop.id });
  const favoriteUsers = (favorites ?? []).map((f) => ({ userId: f.user_id, nickname: f.nickname }));

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">お気に入りユーザーへのメッセージ</h1>
        <p className="mt-1 text-sm text-slate-600">
          {shop.name}をお気に入り登録中のユーザー({favoriteUsers.length}人)にプッシュ通知とお知らせを送れます。割引チケットなどの画像も添付できます。
        </p>
      </div>

      <ShopMessageForm shopId={shop.id} favoriteUsers={favoriteUsers} />
    </div>
  );
}