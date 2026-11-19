import Link from "@/components/i18n/LocaleLink";
import { createClient } from "@/lib/supabase/server";

/**
 * トップの「サイトのお知らせ」。管理画面(トップ)で書いた本文を表示する。本文が空なら何も出さない。
 * リンク先が https:// の外部URLなら別タブ、/ から始まるサイト内パスなら同じタブで開く。
 */
export async function SiteAnnouncement() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("locapass_announcement, locapass_announcement_url").eq("id", true).maybeSingle();
  const text = (data?.locapass_announcement ?? "").trim();
  if (!text) return null;
  const url = (data?.locapass_announcement_url ?? "").trim();
  const external = /^https?:\/\//.test(url);
  return (
    <aside aria-label="お知らせ" className="mx-2 rounded-xl border border-hl-400/30 bg-main/5 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-main">
        <span aria-hidden>📢</span>
        お知らせ
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">{text}</p>
      {url && (
        <div className="mt-2">
          {external ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-hl-400/40 px-3 py-1 text-xs font-semibold text-main hover:border-hl-400/80">
              詳しく見る →
            </a>
          ) : (
            <Link href={url} className="inline-flex items-center gap-1 rounded-full border border-hl-400/40 px-3 py-1 text-xs font-semibold text-main hover:border-hl-400/80">
              詳しく見る →
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
