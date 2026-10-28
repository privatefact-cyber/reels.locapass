import { createAdminClient } from "@/lib/supabase/admin";
import { gbpConfigured, uploadPhoto } from "@/lib/gbp/client";
import { ensureAccountName } from "@/lib/gbp/account";

// 店舗が自分で登録した写真(店舗ギャラリー)だけをGoogleに送る。
// 送らないもの: ユーザーが投稿した写真 / Googleから借りている写真(/api/place-photo/ の中継URL) / http(非https)の画像。
// 店舗の同意(photos_consent_at)が記録されていて、sync_photosがオンの店舗だけが対象。
const db = () => createAdminClient() as any;

const MAX_PER_RUN = 5;

/** 送ってよい写真URLだけに絞る(https・中継URLでない・重複なし) */
export function eligiblePhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const v = u.trim();
    if (!/^https:\/\//i.test(v) || v.includes("/api/place-photo/") || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

export type SendPhotosResult = { status: "ok" | "dry_run" | "skipped" | "error"; message?: string; sent: string[]; pending: string[] };

export async function sendShopPhotos(shopId: string): Promise<SendPhotosResult> {
  const admin = db();
  const { data: link } = await admin.from("locapass_gbp_links").select("*").eq("shop_id", shopId).maybeSingle();
  if (!link || !link.enabled || !link.sync_photos) return { status: "skipped", message: "写真の送信がオフです", sent: [], pending: [] };
  if (!link.photos_consent_at) return { status: "skipped", message: "店舗の同意が記録されていないため、写真は送りません", sent: [], pending: [] };

  const { data: shop } = await admin.from("locapass_shops").select("gallery_image_urls").eq("id", shopId).maybeSingle();
  const { data: sentRows } = await admin.from("locapass_gbp_sent_media").select("source_url").eq("shop_id", shopId);
  const sentSet = new Set<string>(((sentRows ?? []) as { source_url: string }[]).map((r) => r.source_url));
  const todo = eligiblePhotoUrls(shop?.gallery_image_urls).filter((u) => !sentSet.has(u)).slice(0, MAX_PER_RUN);
  if (todo.length === 0) return { status: "ok", message: "送る新しい写真はありません", sent: [], pending: [] };

  if (!gbpConfigured()) return { status: "dry_run", message: "Google未接続のため、送る予定の写真の確認のみ行いました", sent: [], pending: todo };

  const sent: string[] = [];
  try {
    const account = await ensureAccountName(link);
    for (const url of todo) {
      const name = await uploadPhoto(account, link.gbp_location_id, url);
      const { error } = await admin.from("locapass_gbp_sent_media").insert({ shop_id: shopId, source_url: url, google_media_name: name });
      if (error) throw new Error(`送信記録の保存に失敗しました: ${error.message}`);
      sent.push(url);
    }
    return { status: "ok", sent, pending: [] };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e), sent, pending: todo.filter((u) => !sent.includes(u)) };
  }
}
