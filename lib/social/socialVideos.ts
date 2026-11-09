import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadableUrl } from "@/lib/reels/downloadable";

/**
 * SNS(Instagramリール / Threads動画)に使う、掲載店舗の動画を選ぶ。
 * 使うのは、自分たちのサーバー(R2 / Supabase Storage)に置いてある動画だけ。YouTube・TikTok等の埋め込みは使わない。
 * 掲載店舗の動画は、規約の「宣伝・広報(運営の公式SNS等)」の許諾の範囲(動画も対象と規約に明記)。
 */
export type ShopVideo = { videoUrl: string; shopName: string; shopCode: string | null; instagramHandle: string | null; key: string };

const MAX_BYTES = 200 * 1024 * 1024;

const usableVideoUrl = (url: unknown): url is string => typeof url === "string" && isDownloadableUrl(url) && !/\.m3u8(\?|$)/i.test(url) && !/\/placeholders\//.test(url);

function handleOf(sns: any): string | null {
  const h = String(sns?.instagram ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/@?].*$/, "").replace(/^@/, "");
  return /^[\w.]{1,30}$/.test(h) ? h : null;
}

/** 動画ファイルが、投稿に使える形(動画で、大きすぎない)か確認する。 */
async function looksPostable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    const size = Number(res.headers.get("content-length") ?? 0);
    if (type && !/^video\/(mp4|quicktime)/i.test(type)) return false;
    if (size > MAX_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

export async function pickShopVideo(recentKeys: string[], account: "locapass" | "luxela"): Promise<ShopVideo> {
  const admin = createAdminClient() as any;
  const candidates: { key: string; videoUrl: string; shopId: string }[] = [];
  if (account === "luxela") {
    const { data, error } = await admin.from("reels").select("id, shop_id, media").eq("status", "published").is("hidden_at", null).is("embed_provider", null).eq("post_type", "reel").order("created_at", { ascending: false }).limit(300);
    if (error) throw new Error(`リールの取得に失敗しました: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      const v = (Array.isArray(r.media) ? r.media : []).find((m: any) => m?.type === "video" && usableVideoUrl(m.url));
      if (v && r.shop_id) candidates.push({ key: r.id, videoUrl: v.url, shopId: r.shop_id });
    }
  } else {
    const { data, error } = await admin.from("locapass_reels").select("id, shop_id, video_url").eq("status", "publish").not("video_url", "is", null).not("shop_id", "is", null).limit(300);
    if (error) throw new Error(`リールの取得に失敗しました: ${error.message}`);
    for (const r of (data ?? []) as any[]) if (usableVideoUrl(r.video_url)) candidates.push({ key: r.id, videoUrl: r.video_url, shopId: r.shop_id });
  }
  if (candidates.length === 0) throw new Error("使える店舗動画がありません(自前のサーバーにある動画だけを使います)");

  const shopIds = [...new Set(candidates.map((c) => c.shopId))];
  const { data: shops, error: shopError } = account === "luxela"
    ? await admin.from("shops").select("id, name, shop_code, sns_links, status, genre").in("id", shopIds)
    : await admin.from("locapass_shops").select("id, name, shop_code, sns_links, status").in("id", shopIds);
  if (shopError) throw new Error(`店舗の取得に失敗しました: ${shopError.message}`);
  const shopById = new Map<string, any>(((shops ?? []) as any[]).filter((s) => s.status === "active" && s.shop_code && s.genre !== "運営" && !/\[?(サンプル|デモ)/.test(s.name)).map((s) => [s.id, s]));

  const usable = candidates.filter((c) => shopById.has(c.shopId));
  const fresh = usable.filter((c) => !recentKeys.includes(c.key));
  const pool = (fresh.length ? fresh : usable).sort(() => Math.random() - 0.5);
  for (const c of pool.slice(0, 8)) {
    if (!(await looksPostable(c.videoUrl))) continue;
    const shop = shopById.get(c.shopId);
    return { videoUrl: c.videoUrl, shopName: shop.name, shopCode: shop.shop_code ?? null, instagramHandle: handleOf(shop.sns_links), key: c.key };
  }
  throw new Error("投稿できる形の動画が見つかりませんでした(動画ファイルの形式・大きさを確認してください)");
}
