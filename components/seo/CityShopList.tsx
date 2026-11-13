import Link from "@/components/i18n/LocaleLink";
import { shopPath } from "@/lib/locapass/publicUrls";
import { sanitizeImageUrl } from "@/lib/utils/sanitize-image-url";
import { gridThumb } from "@/lib/images/thumb";
import type { CityShop } from "@/lib/seo/cityAreas";

/** 地域ページの店舗一覧(写真・店名・ひとこと・町名)。 */
export function CityShopList({ shops, showCategory = false }: { shops: CityShop[]; showCategory?: boolean }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {shops.map((s) => {
        const img = gridThumb(sanitizeImageUrl(s.coverUrl), 160);
        return (
          <li key={s.id}>
            <Link
              href={shopPath(s.portalSlug, s.slug)}
              className="group flex gap-3 overflow-hidden rounded-2xl border border-line/20 bg-panel-900/60 p-3 transition hover:border-hl-400/50"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-tone-800">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-main">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {[s.town, showCategory ? s.category : null].filter(Boolean).join("・")}
                </p>
                {s.tagline && <p className="mt-1 line-clamp-2 text-xs text-muted">{s.tagline}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
