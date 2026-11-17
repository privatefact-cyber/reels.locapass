"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueMetToken, verifyMetToken } from "@/lib/met/token";
import { castPath } from "@/lib/locapass/publicUrls";

/** 1人のFACESが、1時間にQRでつながれる人数の上限(QRが広まっても、DMが一気に開かないように)。 */
const HOURLY_LIMIT = 20;

export type IssueResult = { ok: true; url: string; expiresAt: number } | { ok: false; error: string };

/** FACES本人だけが呼べる。数分で期限が切れる、会った人用のQRのURLを発行する。 */
export async function issueMeetQr(): Promise<IssueResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です" };
  const { data: castId } = await supabase.rpc("locapass_current_cast_id");
  if (!castId) return { ok: false, error: "FACESのアカウントでログインしてください" };
  const { token, expiresAt } = issueMetToken(castId as string);
  return { ok: true, url: `https://locapass.net/met/${token}`, expiresAt };
}

export type ConnectResult = { ok: true; castName: string; castHref: string | null } | { ok: false; error: string };

/** QRを読んだ人が「つながる」を押したときの処理。FACESをフォローして、FACES側も自動でフォローを返す(DMが開く)。 */
export async function connectViaMeetQr(token: string): Promise<ConnectResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です" };

  const verified = verifyMetToken(token);
  if (!verified.ok) {
    return { ok: false, error: verified.reason === "expired" ? "QRの有効期限が切れました。相手の画面で、新しいQRを表示してもらってください" : "QRが正しくありません" };
  }

  const admin = createAdminClient() as any;
  const { data: cast } = await admin
    .from("locapass_cast_members")
    .select("id, name, user_id, issue_no, locapass_shops ( slug, status, portal:locapass_portals ( slug ) )")
    .eq("id", verified.castId)
    .maybeSingle();
  const shop = Array.isArray(cast?.locapass_shops) ? cast.locapass_shops[0] : cast?.locapass_shops;
  if (!cast || !cast.user_id || shop?.status !== "active") return { ok: false, error: "このQRでは、つながれません" };
  if (cast.user_id === user.id) return { ok: false, error: "ご自身のQRは、読み込めません" };

  const { data: blocked } = await admin.rpc("locapass_is_blocked_between", { p_a: user.id, p_b: cast.user_id });
  if (blocked) return { ok: false, error: "このQRでは、つながれません" };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("locapass_cast_follows")
    .select("user_id", { count: "exact", head: true })
    .eq("cast_id", cast.id)
    .eq("source", "qr")
    .gte("created_at", since);
  if ((count ?? 0) >= HOURLY_LIMIT) return { ok: false, error: "いま混み合っています。少し時間をおいて、もう一度お試しください" };

  // 会った人用のQRでつながった印(source='qr')を付けて、相互フォローにする。すでにフォロー済みでも、印だけ付け直す。
  const { error: e1 } = await admin
    .from("locapass_cast_follows")
    .upsert({ user_id: user.id, cast_id: cast.id, source: "qr" }, { onConflict: "user_id,cast_id" });
  if (e1) return { ok: false, error: "つながれませんでした。もう一度お試しください" };
  const { error: e2 } = await admin
    .from("locapass_user_follows")
    .upsert({ follower_id: cast.user_id, followee_id: user.id, source: "qr" }, { onConflict: "follower_id,followee_id" });
  if (e2) return { ok: false, error: "つながれませんでした。もう一度お試しください" };

  const portal = Array.isArray(shop?.portal) ? shop.portal[0] : shop?.portal;
  return {
    ok: true,
    castName: cast.name,
    castHref: portal?.slug && shop?.slug && cast.issue_no != null ? castPath(portal.slug, shop.slug, cast.issue_no) : null,
  };
}
