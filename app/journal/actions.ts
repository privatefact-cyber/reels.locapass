"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { journalNeedsTranslation, translateJournalPost } from "@/lib/journal/translate";
import { getJournalAccess } from "@/lib/journal/access";
import {
  JOURNAL_RESERVED_SLUGS,
  JOURNAL_SLUG_PATTERN,
  isSafeImageSrc,
  isSafeLinkUrl,
  parseJournalBody,
  type JournalCategory,
} from "@/lib/journal/posts";

export type SaveJournalInput = {
  id?: string;
  slug: string;
  category: JournalCategory;
  title: string;
  description: string;
  lead: string;
  coverUrl: string;
  coverAlt: string;
  bodyText: string;
  status: "draft" | "published";
  publishedOn: string;
  linkUrl: string;
  linkLabel: string;
};

export type SaveJournalResult = { ok: true; slug: string; status: "draft" | "published" } | { ok: false; error: string };

const NO_PERMISSION = "この操作をする権限がありません。ログインし直してお試しください。";

function refresh() {
  // 一覧・記事・sitemapをまとめて新しくする。
  revalidatePath("/journal", "layout");
  revalidatePath("/sitemap.xml");
}

/**
 * 記事の保存(下書き / 公開)。書けるのはルート管理者と投稿担当だけ。
 * 権限は、ここで確認したうえで、データベース側(RLS)でも確認される。
 */
export async function saveJournalPost(input: SaveJournalInput): Promise<SaveJournalResult> {
  const { supabase, user, isEditor } = await getJournalAccess();
  if (!user || !isEditor) return { ok: false, error: NO_PERMISSION };

  const slug = input.slug.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  const lead = input.lead.trim();
  const coverUrl = input.coverUrl.trim();
  const linkUrl = input.linkUrl.trim();
  const linkLabel = input.linkLabel.trim();
  if (!title || title.length > 200) return { ok: false, error: "タイトルは1〜200文字で入力してください。" };
  if (!JOURNAL_SLUG_PATTERN.test(slug) || JOURNAL_RESERVED_SLUGS.includes(slug)) {
    return { ok: false, error: "URL名は、半角の英小文字・数字・ハイフンで、3〜80文字にしてください(new、editors は使えません)。" };
  }
  if (input.category !== "topics" && input.category !== "tips") return { ok: false, error: "カテゴリを選んでください。" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn)) return { ok: false, error: "公開日を入力してください。" };
  if (description.length > 400 || lead.length > 400) return { ok: false, error: "要約と導入文は、400文字以内にしてください。" };
  if (coverUrl && !isSafeImageSrc(coverUrl)) return { ok: false, error: "表紙の写真のURLが正しくありません。" };
  if (linkUrl && !isSafeLinkUrl(linkUrl)) return { ok: false, error: "下のリンクのURLは、https:// か http:// で始まるもの、または / で始まるサイト内のパスにしてください(空白は入れられません)。" };
  if (linkLabel.length > 60) return { ok: false, error: "リンクのボタンの文字は、60文字以内にしてください。" };
  if (input.bodyText.length > 50000) return { ok: false, error: "本文が長すぎます。" };

  const body = parseJournalBody(input.bodyText);
  if (input.status === "published" && body.length === 0) return { ok: false, error: "本文が空のままでは公開できません。" };
  if (input.status === "published" && !description) return { ok: false, error: "公開するには、要約(一覧や検索結果に出る文)を入力してください。" };

  const row = {
    slug,
    category: input.category,
    title,
    description,
    lead: lead || null,
    cover_url: coverUrl || null,
    cover_alt: coverUrl ? input.coverAlt.trim().slice(0, 300) || "写真" : null,
    body,
    status: input.status,
    published_on: input.publishedOn,
    link_url: linkUrl || null,
    link_label: linkUrl && linkLabel ? linkLabel : null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = (supabase as any).from("locapass_journal_posts");
  const result = input.id
    ? await posts.update(row).eq("id", input.id).select("id").maybeSingle()
    : await posts.insert({ ...row, author_id: user.id }).select("id").maybeSingle();

  if (result.error) {
    if (result.error.code === "23505") return { ok: false, error: "そのURL名は、すでに別の記事で使われています。変えてください。" };
    return { ok: false, error: "保存できませんでした。時間をおいて、もう一度お試しください。" };
  }
  // 更新は、対象が0件でもエラーにならないので、行が返ったかで確かめる。
  if (!result.data) return { ok: false, error: "保存できませんでした(記事が見つからないか、権限がありません)。" };

  refresh();

  // 公開する記事は、他の表示言語へ自動翻訳する(保存の応答を待たせないよう、返事のあとに裏で行う)。
  // 失敗しても記事は公開されたまま原文で読める(翻訳が付くまでは、閲覧者には原文が出る)。
  if (input.status === "published") {
    const postId = result.data.id as string;
    after(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = (supabase as any).from("locapass_journal_posts");
        const { data: current } = await table.select("translations").eq("id", postId).maybeSingle();
        const post = { title, description, lead: lead || undefined, cover: coverUrl ? { src: coverUrl, alt: row.cover_alt ?? "" } : undefined, link: row.link_url ? { url: row.link_url, label: row.link_label ?? "" } : undefined, body };
        if (!journalNeedsTranslation(post, current?.translations)) return;
        const translations = await translateJournalPost(post);
        if (!translations) return;
        const { data: saved } = await table.update({ translations }).eq("id", postId).select("id");
        if (saved?.length) refresh();
      } catch (e) {
        console.error("Journalの翻訳に失敗しました:", e);
      }
    });
  }
  return { ok: true, slug, status: input.status };
}

export async function deleteJournalPost(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user, isEditor } = await getJournalAccess();
  if (!user || !isEditor) return { ok: false, error: NO_PERMISSION };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("locapass_journal_posts").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "削除できませんでした。" };
  refresh();
  return { ok: true };
}

/** 投稿担当の追加(ルート管理者だけ)。メールアドレスで、すでに登録のあるアカウントを指名する。 */
export async function addJournalEditor(formData: FormData) {
  const { supabase, user, isSuper } = await getJournalAccess();
  if (!user || !isSuper) redirect("/journal");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/journal/editors?error=" + encodeURIComponent("メールアドレスを入力してください。"));

  const admin = createAdminClient();
  const { data: userId } = await admin.rpc("locapass_get_user_id_by_email" as never, { p_email: email } as never);
  if (!userId) {
    redirect("/journal/editors?error=" + encodeURIComponent("そのメールアドレスのアカウントが見つかりません。先にLOCAPASSへログイン(登録)してもらってください。"));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("locapass_journal_editors")
    .upsert({ user_id: userId, added_by: user.id }, { onConflict: "user_id" });
  if (error) redirect("/journal/editors?error=" + encodeURIComponent("追加できませんでした。"));
  revalidatePath("/journal/editors");
  redirect("/journal/editors?ok=1");
}

export async function removeJournalEditor(formData: FormData) {
  const { supabase, user, isSuper } = await getJournalAccess();
  if (!user || !isSuper) redirect("/journal");
  const userId = String(formData.get("user_id") ?? "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("locapass_journal_editors").delete().eq("user_id", userId).select("user_id");
  if (error || !data?.length) redirect("/journal/editors?error=" + encodeURIComponent("外せませんでした。"));
  revalidatePath("/journal/editors");
  redirect("/journal/editors?ok=1");
}
