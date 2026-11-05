import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { petAdmin } from "./db";
import { pushLineText } from "./notify";

/**
 * ワンコ手帳の「LINEで通知を受け取る」の完了処理(/api/auth/line/callback から mode=pet_link で呼ばれる)。
 * ログイン中のLOCAPASS会員に、LINEのユーザーIDを結びつける(ログイン用の locapass_line_identities とは別に持つ)。
 * つないだ直後にLINEへ確認メッセージを送り、届けば「友だち追加済み」と判断する。
 */
export async function finishPetLineLink(origin: string, lineUserId: string, friendAdded: boolean) {
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/pet/settings?line=${status}`, origin));
    res.cookies.delete("line_oauth");
    return res;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return back("login");

  const admin = petAdmin();
  const { error } = await admin.from("locapass_pet_owner_settings").upsert(
    { user_id: user.id, line_user_id: lineUserId, line_linked_at: new Date().toISOString(), line_notify: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[pet-line] link save failed", error);
    return back("error");
  }

  const delivered = await pushLineText(
    lineUserId,
    "🐶 ワンコ手帳のLINE通知をオンにしました。\nワクチン・狂犬病の時期が近づいたら、ここでお知らせします。",
  );
  return back(delivered ? "ok" : friendAdded ? "pending" : "friend");
}
