import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpConfigured, patchLocation } from "@/lib/gbp/client";
import { buildPatch, type GbpShopInput } from "@/lib/gbp/mapper";

// 呼び出し元(管理画面=運営者のセッション / cron=service role)のクライアントをそのまま受け取る。
// locapass_gbp_links は生成型にまだ無いため any で扱う(sweepTranslationsと同じ流儀)。
type Db = SupabaseClient<any, any, any>;

export type SyncResult = {
  shopId: string;
  status: "ok" | "dry_run" | "error" | "skipped";
  message?: string;
  payload?: unknown;
};

/** 1店舗ぶんをGoogleへ送る。未接続(環境変数なし)なら送らず、送る内容だけ記録する。 */
export async function syncShopToGbp(db: Db, shopId: string): Promise<SyncResult> {
  const { data: link } = await db.from("locapass_gbp_links").select("*").eq("shop_id", shopId).maybeSingle();
  if (!link) return { shopId, status: "skipped", message: "Googleとの紐付けがありません" };
  if (!link.enabled) return { shopId, status: "skipped", message: "同期がオフです" };

  const { data: shop } = await db
    .from("locapass_shops")
    .select("name, address, tel, description, business_hours_weekly, is_temporarily_closed")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) return { shopId, status: "skipped", message: "店舗が見つかりません" };

  const patch = buildPatch(shop as GbpShopInput, {
    sync_hours: link.sync_hours,
    sync_phone: link.sync_phone,
    sync_description: link.sync_description,
    sync_name: link.sync_name,
    sync_address: link.sync_address,
  });
  if (!patch.updateMask) {
    return record(db, shopId, "error", "送る項目がありません(営業時間・電話・説明文が未記入、または全てオフ)", patch);
  }

  if (!gbpConfigured()) return record(db, shopId, "dry_run", "Google未接続のため、送信内容の確認のみ行いました", patch);

  try {
    await patchLocation(link.gbp_location_id, patch.location, patch.updateMask);
    return record(db, shopId, "ok", undefined, patch);
  } catch (e) {
    return record(db, shopId, "error", e instanceof Error ? e.message : String(e), patch);
  }
}

async function record(db: Db, shopId: string, status: "ok" | "dry_run" | "error", message: string | undefined, payload: unknown): Promise<SyncResult> {
  const { error } = await db
    .from("locapass_gbp_links")
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: status,
      last_error: status === "ok" ? null : (message ?? null),
      last_payload: payload as never,
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", shopId);
  // RLSで0件になってもエラーにならないため、書き込み失敗は結果に出す
  return { shopId, status, message: error ? `結果の保存に失敗: ${error.message}` : message, payload };
}

/** 同期がオンの全店舗を順に送る(cron用)。Googleの1分あたり上限を避けるため、間隔を空ける。 */
export async function syncAllToGbp(db: Db): Promise<{ results: SyncResult[] }> {
  const { data: links } = await db.from("locapass_gbp_links").select("shop_id").eq("enabled", true);
  const results: SyncResult[] = [];
  for (const l of links ?? []) {
    results.push(await syncShopToGbp(db, l.shop_id));
    await new Promise((r) => setTimeout(r, 300));
  }
  return { results };
}
