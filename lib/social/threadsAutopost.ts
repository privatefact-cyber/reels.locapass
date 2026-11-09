import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoShop } from "@/lib/seo/demo";
import { SITE_ORIGIN } from "@/lib/siteOrigin";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { publishThreadsImagePost, threadsConfigFromEnv } from "@/lib/social/threads";

/**
 * 公開中のリールを、LOCAPASS公式のThreadsへ自動で紹介する。
 * 対象外: 他サイトの動画(YouTube・TikTok・Instagram)を埋め込んだリール。他の人の動画のサムネイルを、公式アカウントの投稿に使わないため。
 * 対象: 「公式SNSでの紹介をOKにする」を入れた公開中の店舗の、直近7日以内の公開リール(まだ投稿していないもの)。
 * 既定はオフ。THREADS_AUTOPOST_ENABLED=1 と、THREADS_USER_ID / THREADS_ACCESS_TOKEN が揃ったときだけ実際に投稿する。
 * 1回の実行で最大 PER_RUN 件、24時間で最大 DAILY_MAX 件まで(投稿の連打で不自然にならないように)。
 */
/** 投稿の対象にする、リールの公開からの日数。動作確認で古いリールを使いたいときは、環境変数 THREADS_WINDOW_DAYS で延ばせる。 */
const WINDOW_DAYS = Number(process.env.THREADS_WINDOW_DAYS ?? 7) || 7;
const PER_RUN = 2;
const DAILY_MAX = Number(process.env.THREADS_DAILY_MAX ?? 6) || 6;

type Candidate = {
  id: string;
  caption: string | null;
  poster_url: string | null;
  images: { url?: string }[] | null;
  published_at: string | null;
  shop: { name: string; slug: string; social_repost_ok: boolean } | null;
};

export function composeThreadsText(shopName: string, caption: string | null, reelUrl: string): string {
  const body = (caption ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  const lines = [body, `📍 ${shopName}`, `動画で見る → ${reelUrl}`].filter(Boolean);
  return lines.join("\n\n").slice(0, 500);
}

export async function runThreadsAutopost(options: { dryRun: boolean }) {
  const admin = createAdminClient() as any;
  const config = threadsConfigFromEnv();
  const enabled = process.env.THREADS_AUTOPOST_ENABLED === "1";
  const live = enabled && config !== null && !options.dryRun;

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data: posted24h } = await admin.from("locapass_social_posts").select("id").eq("platform", "threads").eq("status", "posted").gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const remainingToday = Math.max(0, DAILY_MAX - (posted24h?.length ?? 0));

  const { data: rows, error } = await admin
    .from("locapass_reels")
    .select("id, caption, poster_url, images, published_at, shop:locapass_shops!locapass_reels_shop_id_fkey!inner ( name, slug, social_repost_ok, status )")
    .eq("status", "publish")
    .is("embed_provider", null)
    .or("expires_at.is.null,expires_at.gt.now()")
    .gte("published_at", since)
    .eq("locapass_shops.status", "active")
    .eq("locapass_shops.social_repost_ok", true)
    .order("published_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(`投稿候補の取得に失敗しました: ${error.message}`);

  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  const { data: already } = ids.length ? await admin.from("locapass_social_posts").select("reel_id").eq("platform", "threads").in("reel_id", ids) : { data: [] };
  const done = new Set(((already ?? []) as { reel_id: string }[]).map((r) => r.reel_id));

  const candidates = ((rows ?? []) as Candidate[])
    .filter((r) => !done.has(r.id) && r.shop && !isDemoShop(r.shop.name, r.shop.slug))
    .map((r) => {
      const imageUrl = sanitizeImageUrl(r.poster_url) ?? sanitizeImageUrl(r.images?.[0]?.url);
      return imageUrl && r.shop ? { id: r.id, imageUrl, text: composeThreadsText(r.shop.name, r.caption, `${SITE_ORIGIN}/reel/${r.id}`) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const batch = candidates.slice(0, Math.min(PER_RUN, remainingToday));
  const result = {
    mode: live ? "live" : options.dryRun ? "dry-run" : "disabled",
    enabled, configured: config !== null, remainingToday,
    eligible: candidates.length,
    posts: [] as { reelId: string; status: "would-post" | "posted" | "failed"; error?: string; text: string }[],
  };

  for (const candidate of batch) {
    if (!live || !config) {
      result.posts.push({ reelId: candidate.id, status: "would-post", text: candidate.text });
      continue;
    }
    try {
      const externalId = await publishThreadsImagePost(config, { text: candidate.text, imageUrl: candidate.imageUrl });
      await admin.from("locapass_social_posts").insert({ reel_id: candidate.id, platform: "threads", status: "posted", external_id: externalId });
      result.posts.push({ reelId: candidate.id, status: "posted", text: candidate.text });
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 400) : "投稿に失敗しました";
      // 失敗も記録して、同じリールを毎回リトライして連打しない(再試行したいときは、この行を消す)。
      await admin.from("locapass_social_posts").insert({ reel_id: candidate.id, platform: "threads", status: "failed", error: message });
      result.posts.push({ reelId: candidate.id, status: "failed", error: message, text: candidate.text });
      break;
    }
  }
  return result;
}
