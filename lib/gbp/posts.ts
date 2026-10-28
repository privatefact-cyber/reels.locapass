import { createAdminClient } from "@/lib/supabase/admin";
import { createLocalPost, gbpConfigured } from "@/lib/gbp/client";
import { ensureAccountName } from "@/lib/gbp/account";

// Googleの「最新情報」への投稿。送るたびに、運営者(または店舗)が文面を確認して押す形(自動投稿はしない)。
const db = () => createAdminClient() as any;

export type PostResult = { status: "ok" | "dry_run" | "error"; message?: string };

function safeUrl(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return /^https:\/\//i.test(s) ? s : null;
}

export async function postToGoogle(
  shopId: string,
  userId: string,
  input: { summary: string; linkUrl?: string | null; photoUrl?: string | null },
): Promise<PostResult> {
  const summary = input.summary.trim();
  if (!summary) throw new Error("投稿の文章を入力してください");
  if (summary.length > 1500) throw new Error("投稿は1500文字以内にしてください");
  const linkUrl = safeUrl(input.linkUrl);
  const photoUrl = safeUrl(input.photoUrl);
  if (photoUrl?.includes("/api/place-photo/")) throw new Error("Googleから借りている写真は、投稿に使えません");

  const admin = db();
  const { data: link } = await admin.from("locapass_gbp_links").select("*").eq("shop_id", shopId).maybeSingle();
  if (!link || !link.enabled) throw new Error("この店舗はGoogleと連携していません");

  const record = async (status: "ok" | "dry_run" | "error", extra: { name?: string | null; error?: string }): Promise<PostResult> => {
    await admin.from("locapass_gbp_posts").insert({
      shop_id: shopId,
      summary,
      link_url: linkUrl,
      photo_url: photoUrl,
      status,
      google_post_name: extra.name ?? null,
      error: extra.error ?? null,
      created_by: userId,
    });
    return { status, message: extra.error };
  };

  if (!gbpConfigured()) return record("dry_run", { error: "Google未接続のため、投稿の内容の確認のみ行いました(Googleには送られていません)" });
  try {
    const account = await ensureAccountName(link);
    const name = await createLocalPost(account, link.gbp_location_id, { summary, linkUrl, photoUrl });
    return record("ok", { name });
  } catch (e) {
    return record("error", { error: e instanceof Error ? e.message : String(e) });
  }
}
