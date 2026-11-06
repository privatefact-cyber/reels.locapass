"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { collectYoutubeCandidates, createShopForIngestion, defaultCategoryForPortal, findExistingShop, identifyShopFromVideo, intakePortalForAddress, matchOrCreateAndPublish, processPendingIngestions, publishYoutubeIngestion, resolveShopFromOfficialSite, saveYoutubeCandidates } from "@/lib/youtube/shopIngestion";
import { normalizeCategory } from "@/lib/shop/locapassCategories";
import { enrichNewShop } from "@/lib/shop/enrichNewShop";
import { parseVideoUrl } from "@/lib/video";
import { expandShortVideoUrl } from "@/lib/video-resolve";
import { MAX_THUMB_BYTES, uploadThumb } from "@/lib/embed-post/createEmbedPost";

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
  // AI判定済み(match_reasonあり)の保留は除外し、同じ候補ばかり再処理しない。新しい順に処理する。
  // cron(/api/cron/youtube-beauty)と同じ処理を使う。失敗理由は動画カードに表示する。
  await processPendingIngestions({ portalId, limit: 5, userId: user.id });
  refresh();
}

/** 追加・収集の失敗を、サーバーエラー画面ではなく動画ストックの上部に表示する。 */
function failToStock(message: string): never {
  redirect(`/admin/youtube-stock?collection=error&message=${encodeURIComponent(message.slice(0, 180))}`);
}

/**
 * TikTokの動画をストックに追加する。スマホの共有リンク(vt.tiktok.com/… などの短縮URL、
 * 「〇〇さんの動画をチェック https://vt.tiktok.com/…」のような文章つき)も受け付ける。
 * 短縮URLはサーバー側でたどって動画IDを取り出してから保存する。
 */
export async function addTikTokUrl(formData: FormData) {
  await requireRootAdmin();
  const pasted = String(formData.get("tiktok_url") ?? "").trim();
  const rawUrl = pasted.match(/https?:\/\/[^\s]+/)?.[0] ?? pasted;
  const portalId = Number(formData.get("portal_id") ?? DEFAULT_INTAKE_PORTAL_ID);
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return failToStock("TikTokのURLを入力してください"); }
  if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return failToStock("TikTokのURLを入力してください");
  const admin = createAdminClient();
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) return failToStock("有効なポータルを選択してください");

  // 共有リンクは動画IDがURLに入っていないので、リダイレクトをたどって本来のURLにする。
  const expanded = await expandShortVideoUrl(rawUrl);
  const video = parseVideoUrl(expanded);
  if (!video || video.provider !== "tiktok") {
    return failToStock("共有リンクから動画を特定できませんでした。ブラウザで開いたときのURL(…/video/数字)を貼ってください");
  }
  const sourceId = video.ref;
  const canonicalUrl = expanded.split("?")[0].replace(/\/$/, "");

  let title = "TikTok動画";
  let description: string | null = null;
  let channelTitle: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title?.trim() || title;
      channelTitle = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || null;
      description = title;
    }
  } catch { /* URLはストックし、メタデータ取得は後で再試行できる */ }

  // upsert(onConflict)は使わない。重複防止の一意インデックスが部分インデックス(source_id is not null)で、
  // PostgRESTのON CONFLICTが対応できず「no unique or exclusion constraint matching」で毎回失敗していた。
  const table = (admin as any).from("locapass_youtube_ingestions");
  const { data: existing, error: existingError } = await table.select("id").eq("portal_id", portalId).eq("source_provider", "tiktok").eq("source_id", sourceId).maybeSingle();
  if (existingError) return failToStock(`TikTok動画の確認に失敗しました: ${existingError.message}`);
  if (existing) {
    refresh();
    redirect("/admin/youtube-stock?collection=added&message=" + encodeURIComponent("このTikTok動画はすでにストックにあります"));
  }
  const { error } = await (admin as any).from("locapass_youtube_ingestions").insert({
    portal_id: portalId,
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
  });
  if (error && error.code !== "23505") return failToStock(`TikTok動画の保存に失敗しました: ${error.message}`);
  refresh();
  redirect("/admin/youtube-stock?collection=added&message=" + encodeURIComponent(`TikTok動画をストックに追加しました(${title.slice(0, 40)})`));
}

/**
 * 動画ストックのカードに、管理者が切り取った正方形のサムネイルを設定する。
 * TikTokは公式にサムネイルを取れない(oEmbedが画像を返さない)ので、ここで画像を入れる。
 * すでにリールとして公開済みなら、そのリールのサムネイルも同じ画像にする。
 */
export async function setYoutubeStockThumbnail(ingestionId: string, formData: FormData) {
  await requireRootAdmin();
  const file = formData.get("thumb");
  if (!(file instanceof File) || file.size === 0) throw new Error("画像を選んでください");
  if (!file.type.startsWith("image/")) throw new Error("サムネイルは画像ファイルを選んでください");
  if (file.size > MAX_THUMB_BYTES) throw new Error("サムネイル画像が大きすぎます(上限3MB)");
  const admin = createAdminClient();
  const { data: row, error: readError } = await (admin as any).from("locapass_youtube_ingestions").select("id, reel_id").eq("id", ingestionId).maybeSingle();
  if (readError || !row) throw new Error(readError?.message ?? "候補が見つかりません");
  const url = await uploadThumb(admin, await file.arrayBuffer(), file.type);
  if (!url) throw new Error("サムネイルのアップロードに失敗しました");
  // 0件でもエラーにならないので.select()で確認する。
  const { data: updated, error } = await (admin as any).from("locapass_youtube_ingestions").update({ thumbnail_url: url }).eq("id", ingestionId).select("id");
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!updated?.length) throw new Error("保存できませんでした(対象が見つかりません)");
  if (row.reel_id) {
    const { error: reelError } = await (admin as any).from("locapass_reels").update({ poster_url: url }).eq("id", row.reel_id).not("embed_provider", "is", null);
    if (reelError) throw new Error(`リールのサムネイル更新に失敗しました: ${reelError.message}`);
  }
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
  const { data: current, error: currentError } = await (admin as any)
    .from("locapass_youtube_ingestions")
    .select("portal_id, title, description, official_url, reel_id, matched_shop_id")
    .eq("id", ingestionId)
    .maybeSingle();
  if (currentError || !current) throw new Error(currentError?.message ?? "候補が見つかりません");
  let candidateName = String(formData.get("candidate_name") ?? "").trim().slice(0, 120) || null;
  let candidateAddress = String(formData.get("candidate_address") ?? "").trim().slice(0, 300) || null;
  const officialUrl = String(formData.get("official_url") ?? "").trim() || null;
  const shopId = String(formData.get("shop_id") ?? "").trim() || null;
  const decision = String(formData.get("decision") ?? "pending");
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  const portalId = Number(formData.get("portal_id") ?? current.portal_id ?? DEFAULT_INTAKE_PORTAL_ID);
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");
  if (!["pending", "matched_existing", "ready_to_create", "rejected"].includes(decision)) throw new Error("不正な判定です");
  if (decision === "matched_existing" && (!shopId || !officialUrl)) throw new Error("既存店舗への紐づけには店舗IDと公式サイトが必要です");
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  if (shopId) {
    const { data: shop } = await admin.from("locapass_shops").select("id").eq("id", shopId).eq("portal_id", portalId).maybeSingle();
    if (!shop) throw new Error("選択したポータルの店舗IDを入力してください");
  }

  // 公式サイトのURLが新しく貼られた、または店名・住所が空のままなら、サイトから店名・住所・業種を自動で埋める。
  // 手入力済みの項目は上書きしない。
  const urlChanged = Boolean(officialUrl) && officialUrl !== current.official_url;
  let note: string | null = null;
  let resolved: Awaited<ReturnType<typeof resolveShopFromOfficialSite>> | null = null;
  if (officialUrl && decision === "pending" && !shopId && (urlChanged || !candidateName || !candidateAddress)) {
    resolved = await resolveShopFromOfficialSite({ officialUrl, title: current.title, description: current.description, name: candidateName, address: candidateAddress });
    candidateName = candidateName ?? resolved.name;
    candidateAddress = candidateAddress ?? resolved.address;
    note = resolved.note;
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
    error_message: note,
  }).eq("id", ingestionId);
  if (error) throw new Error(`判定の保存に失敗しました: ${error.message}`);

  // 公式サイトの手がかりで店名・住所がそろったら、既存店へ紐づけ or 新規登録してそのままリール公開まで進める。
  if (resolved && candidateName && candidateAddress && officialUrl && !current.reel_id && !current.matched_shop_id) {
    try {
      await matchOrCreateAndPublish(ingestionId, {
        portalId, name: candidateName, address: candidateAddress, officialUrl,
        category: resolved.category ?? defaultCategoryForPortal(portalId),
        reason: reason ?? "公式サイトのURLから店名・住所を自動取得して掲載", userId: user.id, preview: resolved.preview,
      });
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message.slice(0, 500) : "自動掲載に失敗しました";
      await (admin as any).from("locapass_youtube_ingestions").update({ error_message: message }).eq("id", ingestionId);
    }
  }
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
  const portalId = Number(formData.get("portal_id") || intakePortalForAddress(address));
  const category = normalizeCategory(String(formData.get("category") ?? "")) ?? defaultCategoryForPortal(portalId);
  const publish = String(formData.get("publish") ?? "") === "1";
  const reason = String(formData.get("match_reason") ?? "").trim().slice(0, 500) || null;
  if (!name || !address) throw new Error("店名と住所を入力してください");
  if (officialUrl && !/^https:\/\/[^\s]+$/i.test(officialUrl)) throw new Error("公式サイトは https:// から始まるURLを入力してください");
  const { data: portal } = await admin.from("locapass_portals").select("id").eq("id", portalId).eq("status", "active").maybeSingle();
  if (!portal) throw new Error("有効なポータルを選択してください");
  await createShopForIngestion(ingestionId, { portalId, name, address, officialUrl, category, publish, reason });
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

