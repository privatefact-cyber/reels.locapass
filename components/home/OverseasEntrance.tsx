import Link from "@/components/i18n/LocaleLink";
import { createClient } from "@/lib/supabase/server";
import { OVERSEAS_PORTALS } from "@/lib/youtube/shopIngestion";

/**
 * トップの「海外(β版)」の入口。公開中の海外ポータル(セブなど)へ案内する。
 * 公開前(status が active でない)のポータルは出さない。店舗が1件も無いポータルも出さない。
 */
export async function OverseasEntrance({ locale }: { locale: "ja" | "en" | string }) {
  const supabase = await createClient();
  const { data: portals } = await supabase.from("locapass_portals").select("id, slug, name, name_en").eq("status", "active").in("slug", Object.keys(OVERSEAS_PORTALS));
  const list: { slug: string; label: string; count: number }[] = [];
  for (const p of portals ?? []) {
    const { count } = await supabase.from("locapass_shops").select("id", { count: "exact", head: true }).eq("portal_id", p.id).eq("status", "active");
    if ((count ?? 0) > 0) list.push({ slug: p.slug, label: locale === "ja" ? p.name : (p.name_en ?? p.name), count: count ?? 0 });
  }
  if (list.length === 0) return null;
  const ja = locale === "ja";
  return (
    <nav aria-label={ja ? "海外のお店" : "Overseas places"} className="mx-2 rounded-xl border border-hl-400/30 bg-main/5 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-main">
        <span aria-hidden>🌏</span>
        {ja ? "海外のお店" : "Overseas places"}
        <span className="rounded-full bg-hl-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-hl-200">BETA</span>
      </p>
      <p className="mt-1 text-xs text-muted">{ja ? "海外の街のお店も、動画で探せます(順次、地域を増やしています)。" : "Find places abroad through short videos (more cities coming)."}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((l) => (
          <li key={l.slug}>
            <Link href={`/${l.slug}`} className="inline-flex items-center gap-1 rounded-full border border-hl-400/40 px-3 py-1 text-xs font-semibold text-main hover:border-hl-400/80">
              {l.label}{ja ? `のお店を見る(${l.count})` : ` (${l.count})`} →
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
