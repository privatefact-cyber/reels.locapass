"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { collectYoutubeCandidates, extractShopHint, findExistingShop, geocodeShopIfMissing, identifyShopFromVideo, importOfficialProfileIfMissing, intakePortalForAddress, publishYoutubeIngestion, saveYoutubeCandidates } from "@/lib/youtube/shopIngestion";
import { normalizeCategory } from "@/lib/shop/locapassCategories";
import { enrichNewShop } from "@/lib/shop/enrichNewShop";
import crypto from "node:crypto";

const DEFAULT_INTAKE_PORTAL_ID = 55;

function refresh() {
  revalidatePath("/admin/youtube-intake");
  revalidatePath("/admin/youtube-stock");
  revalidatePath("/admin/embeds");
  revalidatePath("/");
  revalidatePath("/map");
}

export async function collectShibuyaShorts(formData: FormData) {
  await requireRootAdmin();
  const query = String(formData.get("query") ?? "渋谷 グルメ カフェ").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(formData.get("limit") ?? 50), 1), 50);
  const portalId = Number(formData.get("portal_id") ?? DEFAULT_INTAKE_PORTAL_ID);
  if (!query) throw new Error("検索キーワードを入力してください");
  const { data: portal } = await createAdminClient().from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  let candidates;
  let saved;
  try {
    candidates = await collectYoutubeCandidates(query, limit);
    saved = await saveYoutubeCandidates(portalId, candidates);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "YouTube収集に失敗しました";
    redirect(`/admin/youtube-stock?collection=error&message=${encodeURIComponent(message)}`);
  }
  // 収集時は候補の保存だけを行う。店舗判定・公開は右側の「新しい保留を5件処理」で明示的に実行する。
  refresh();
  redirect(`/admin/youtube-stock?collection=done&query=${encodeURIComponent(query)}&fetched=${candidates.length}&saved=${saved}`);
}

function extractYoutubeId(rawUrl: string) {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("YouTubeの共有URLを入力してください"); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let id = "";
  if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    id = parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("YouTube動画の共有URLを確認してください");
  return id;
}

export async function addYoutubeUrl(formData: FormData) {
  await requireRootAdmin();
  const rawUrl = String(formData.get("youtube_url") ?? "").trim();
  const youtubeId = extractYoutubeId(rawUrl);
  const portalId = Number(formData.get("portal_id") ?? DEFAULT_INTAKE_PORTAL_ID);
  const admin = createAdminClient();
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");

  const canonicalUrl = `https://www.youtube.com/shorts/${youtubeId}`;
  let title = "YouTube動画";
  let channelTitle: string | null = null;
  let thumbnailUrl: string | null = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`, { next: { revalidate: 3600 } });
    if (response.ok) {
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title?.trim() || title;
      channelTitle = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || thumbnailUrl;
    }
  } catch { /* メタデータ取得に失敗してもURLはストックする */ }

  const { error } = await (admin as any).from("locapass_youtube_ingestions").upsert({
    portal_id: portalId,
    youtube_id: youtubeId,
    source_provider: "youtube",
    source_id: youtubeId,
    video_url: canonicalUrl,
    title,
    description: null,
    channel_title: channelTitle,
    thumbnail_url: thumbnailUrl,
    source_query: "manual:youtube-url",
    embeddable: true,
    match_status: "pending",
  }, { onConflict: "portal_id,youtube_id", ignoreDuplicates: true });
  if (error) throw new Error(`YouTube動画の保存に失敗しました: ${error.message}`);
  refresh();
}

/**
 * 保留候補を少量ずつAIで判定し、店名と住所(番地まで)が分かったものは掲載する。
 * 既存店に一致すればその店にリールを追加、無ければ店舗を公開で新規登録→座標登録→リール投稿まで行う。
 * 公式サイトは見つかった場合だけ店舗に保存する(掲載の条件にはしない)。
 */
export async function autoProcessPendingYoutube(formData: FormData) {
  const user = await requireRootAdmin();
  const rawPortalId = String(formData.get("portal_id") ?? "").trim();
  const portalId = rawPortalId ? Number(rawPortalId) : null;
  if (portalId !== null && (!Number.isInteger(portalId) || portalId <= 0)) throw new Error("ポータルを確認してください");
  const admin = createAdminClient();
  // AI判定済み(match_reasonあり)の保留は除外し、同じ候補ばかり再処理しないようにする。
  // 管理画面も新しい順なので、収集した直後の候補から処理して結果をすぐ確認できるようにする。
  let query = (admin as any).from("locapass_youtube_ingestions")
    .select("id, portal_id, title, description, candidate_name, candidate_address")
    .eq("source_provider", "youtube")
    .eq("match_status", "pending")
    .is("match_reason", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (portalId) query = query.eq("portal_id", portalId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`保留候補の取得に失敗しました: ${error.message}`);
  for (const row of (rows ?? []) as { id: string; portal_id: number; title: string; description: string | null; candidate_name: string | null; candidate_address: string | null }[]) {
    try {
      const hint = extractShopHint(row.title, row.description ?? "");
      const result = await identifyShopFromVideo({ title: row.title, description: row.description, name: hint.name ?? row.candidate_name, address: hint.address ?? row.candidate_address });
      if (!result.name || !result.address) {
        await (admin as any).from("locapass_youtube_ingestions").update({ candidate_name: result.name, candidate_address: result.address, match_reason: result.reason || "店名・住所を特定できず", error_message: "店名・住所を特定できないため保留" }).eq("id", row.id);
        continue;
      }
      // 収集時に選択されたポータルを優先する。
      // 美容系(Health & Beauty)は美容ポータルのまま、一般・不明候補は
      // 管理画面で指定したLOCAPASS等のポータルに登録する。住所だけで
      // 渋谷/横浜へ自動移送すると、カテゴリ別ポータルの意図が崩れる。
      const targetPortalId = row.portal_id || intakePortalForAddress(result.address);
      const existing = await findExistingShop(targetPortalId, result.name, result.address);
      if (existing.length === 1) {
        const { error: matchError } = await (admin as any).from("locapass_youtube_ingestions").update({
          portal_id: targetPortalId, candidate_name: result.name, candidate_address: result.address, official_url: result.officialUrl ?? existing[0].url,
          official_url_verified: Boolean(result.officialUrl ?? existing[0].url), matched_shop_id: existing[0].id, match_status: "matched_existing",
          match_reason: `店名・住所が既存店舗に一意一致: ${result.reason}`.slice(0, 500), reviewed_at: new Date().toISOString(), reviewed_by: user.id, error_message: null,
        }).eq("id", row.id);
        if (matchError) throw new Error(`候補の更新に失敗しました: ${matchError.message}`);
        await publishYoutubeIngestion(row.id, user.id);
        continue;
      }
      const draft = new FormData();
      draft.set("portal_id", String(targetPortalId));
      draft.set("name", result.name);
      draft.set("address", result.address);
      draft.set("official_url", result.officialUrl ?? "");
      draft.set("category", result.category);
      draft.set("publish", "1");
      draft.set("match_reason", result.reason);
      await createDraftShopFromIngestion(row.id, draft);
      await publishYoutubeIngestion(row.id, user.id);
    } catch (processError) {
      const message = processError instanceof Error ? processError.message.slice(0, 500) : "自動処理に失敗しました";
      console.error(`YouTube候補の自動処理に失敗しました(${row.id}): ${message}`);
      await (admin as any).from("locapass_youtube_ingestions").update({ error_message: message }).eq("id", row.id);
    }
  }
  refresh();
}

export async function addTikTokUrl(formData: FormData) {
  await requireRootAdmin();
  const rawUrl = String(formData.get("tiktok_url") ?? "").trim();
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error("TikTok URLを入力してください"); }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) throw new Error("TikTokのURLを入力してください");
  const canonicalUrl = rawUrl.split("?")[0];
  const sourceId = canonicalUrl.match(/video\/(\d+)/)?.[1] ?? crypto.createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32);
  let title = "TikTok動画";
  let description: string | null = null;
  let channelTitle: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, { next: { revalidate: 3600 } });
    if (response.ok) {
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title?.trim() || title;
      channelTitle = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || null;
      description = title;
    }
  } catch { /* URLはストックし、メタデータ取得は後で再試行できる */ }
  const { error } = await (createAdminClient() as any).from("locapass_youtube_ingestions").upsert({
    portal_id: DEFAULT_INTAKE_PORTAL_ID,
    youtube_id: null,
    source_provider: "tiktok",
    source_id: sourceId,
    video_url: canonicalUrl,
    title,
    description,
    channel_title: channelTitle,
    thumbnail_url: thumbnailUrl,
    source_query: "manual:tiktok",
    match_status: "pending",
  }, { onConflict: "portal_id,source_provider,source_id", ignoreDuplicates: true });
  if (error) throw new Error(`TikTok動画の保存に失敗しました: ${error.message}`);
  refresh();
}

export async function searchExistingShibuyaShop(name: string, address?: string) {
  await requireRootAdmin();
  return findExistingShop(DEFAULT_INTAKE_PORTAL_ID, name, address);
}

export async function findOfficialSiteForIngestion(ingestionId: string) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data, error } = await (admin as any).from("locapass_youtube_ingestions").select("title, description, candidate_name, candidate_address, match_reason").eq("id", ingestionId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "候補が見つかりません");
  const result = await identifyShopFromVideo({ title: data.title, description: data.description, name: data.candidate_name, address: data.candidate_address });
  const { error: updateError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: result.name,
    candidate_address: result.address,
    official_url: result.officialUrl,
    official_url_verified: false,
    match_reason: result.reason,
  }).eq("id", ingestionId);
  if (updateError) throw new Error(`公式サイト候補の保存に失敗しました: ${updateError.message}`);
  refresh();
}

export async function reviewYoutubeIngestion(ingestionId: string, formData: FormData) {
  const user = await requireRootAdmin();
  const admin = createAdminClient();
  const { data: currentIngestion, error: currentIngestionError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("portal_id")
    .eq("id", ingestionId)
    .maybeSingle();
  if (currentIngestionError || !currentIngestion) throw new Error(currentIngestionError?.message ?? "候補が見つかりません");
  const candidateName = String(formData.get("candidate_name") ?? "").trim().slice(0, 120) || null;
  const candidateAddress = String(formData.get("candidate_address") ?? "").trim().slice(0, 300) || null;
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const shopId = String(formData.get("shop_id") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "pending");
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  const portalId = Number(formData.get("portal_id") ?? currentIngestion.portal_id ?? DEFAULT_INTAKE_PORTAL_ID);
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");
  if (!["pending", "matched_existing", "ready_to_create", "rejected"].includes(decision)) throw new Error("不正な判定です");
  if (decision === "matched_existing" && (!shopId || !officialUrl)) throw new Error("既存店舗への紐づけには店舗IDと公式サイトが必要です");
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  if (shopId) {
    const { data: shop } = await admin.from("locapass_shops").select("id").eq("id", shopId).eq("portal_id", portalId).maybeSingle();
    if (!shop) throw new Error("選択したポータルの店舗IDを入力してください");
  }
  const { error } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: candidateName,
    candidate_address: candidateAddress,
    official_url: officialUrl,
    official_url_verified: Boolean(officialUrl),
    matched_shop_id: shopId,
    match_status: decision,
    match_reason: reason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    portal_id: portalId,
    error_message: null,
  }).eq("id", ingestionId);
  if (error) throw new Error(`判定の保存に失敗しました: ${error.message}`);
  refresh();
}

/**
 * 店名と住所が分かった候補から、既存の店舗発行RPCで店舗を作る。
 * 公式サイトは任意(あれば保存し、空欄の店舗詳細を公式サイトから補完する)。
 * 住所から座標を求めて地図に出せる状態にし、publish=1 のときは公開(active)にする。
 */
export async function createDraftShopFromIngestion(ingestionId: string, formData: FormData) {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data: currentIngestion, error: currentIngestionError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("portal_id")
    .eq("id", ingestionId)
    .maybeSingle();
  if (currentIngestionError || !currentIngestion) throw new Error(currentIngestionError?.message ?? "候補が見つかりません");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const address = String(formData.get("address") ?? "").trim().slice(0, 300);
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const category = normalizeCategory(String(formData.get("category") ?? "カフェ・スイーツ")) ?? "カフェ・スイーツ";
  const publish = String(formData.get("publish") ?? "") === "1";
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  if (!name || !address) throw new Error("店名と住所を入力してください");
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");

  const portalId = Number(formData.get("portal_id") || intakePortalForAddress(address));
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  const client = await createClient();
  const { data: shopId, error } = await (client as any).rpc("locapass_create_shop", {
    p_portal_id: portalId,
    p_name: name,
    p_category: category,
    p_address: address,
    p_business_type: "food",
  });
  if (error || !shopId) throw new Error(error?.message ?? "店舗の登録に失敗しました");
  const patch: { url?: string; status?: string } = {};
  if (officialUrl) patch.url = officialUrl;
  if (publish) patch.status = "active";
  if (Object.keys(patch).length > 0) {
    const { data: updated, error: updateError } = await admin.from("locapass_shops").update(patch).eq("id", shopId).select("id");
    if (updateError || !updated?.length) throw new Error(`店舗の更新に失敗しました: ${updateError?.message ?? "0件"}`);
  }
  // 座標が取れないと地図に出ないので、失敗は候補側に記録して管理者が住所を直せるようにする。
  const coords = await geocodeShopIfMissing(shopId).catch(() => null);
  const imported = officialUrl ? await importOfficialProfileIfMissing(shopId, officialUrl) : { applied: [], error: null };
  // 住所の英語表記・紹介文の翻訳を、登録と同時に埋める(Googleの写真は費用のため使わない)。
  const enriched = await enrichNewShop(admin as any, shopId).catch((e) => ({ note: e instanceof Error ? e.message : "補完に失敗" }));
  const notes = [
    coords ? null : "住所から座標を求められませんでした(地図に出ません)",
    imported.error ? `公式情報の自動取込: ${imported.error}` : null,
    enriched.note ? `不足項目の補完: ${enriched.note}` : null,
  ].filter(Boolean).join(" / ");
  const { error: ingestionError } = await (admin as any).from("locapass_youtube_ingestions").update({
    candidate_name: name,
    candidate_address: address,
    official_url: officialUrl,
    official_url_verified: Boolean(officialUrl),
    matched_shop_id: shopId,
    portal_id: portalId,
    match_status: "ready_to_create",
    ...(reason ? { match_reason: reason } : {}),
    error_message: notes || null,
  }).eq("id", ingestionId);
  if (ingestionError) throw new Error(`候補の更新に失敗しました: ${ingestionError.message}`);
  refresh();
}

/**
 * 動画ストックから登録した公開店舗のうち、住所の英語表記が無い店舗を少しずつ補完する。
 * Gemini の呼び出しを伴うので、1回あたり最大15店舗。Googleの写真は費用のため使わない。
 */
export async function enrichIntakeShops() {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data: links, error } = await (admin as any).from("locapass_youtube_ingestions").select("matched_shop_id").not("matched_shop_id", "is", null);
  if (error) throw new Error(`取り込み店舗の取得に失敗しました: ${error.message}`);
  const ids = [...new Set(((links ?? []) as { matched_shop_id: string }[]).map((r) => r.matched_shop_id))];
  if (ids.length === 0) return;
  const { data: shops } = await admin.from("locapass_shops").select("id, address_en").in("id", ids).eq("status", "active");
  const targets = (shops ?? []).filter((s) => !s.address_en).slice(0, 15);
  for (const shop of targets) {
    const result = await enrichNewShop(admin as any, shop.id).catch((e) => ({ note: e instanceof Error ? e.message : "補完に失敗" }));
    if (result.note) console.error(`店舗の補完で一部失敗しました(${shop.id}): ${result.note}`);
  }
  refresh();
}

export async function publishReviewedYoutubeIngestion(ingestionId: string) {
  const user = await requireRootAdmin();
  await publishYoutubeIngestion(ingestionId, user.id);
  refresh();
}

