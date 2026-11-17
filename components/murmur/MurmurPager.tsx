import Link from "@/components/i18n/LocaleLink";
import { murmurLabels } from "@/lib/murmur/labels";

export function MurmurPager({ basePath, page, total, pageSize, locale }: { basePath: string; page: number; total: number; pageSize: number; locale: string }) {
  const t = murmurLabels(locale);
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  const cls = "rounded-lg border border-tone-700/60 px-4 py-2 text-sm text-main";
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="pagination">
      {page > 1 ? <Link href={href(page - 1)} className={cls}>← {t.prev}</Link> : <span />}
      <span className="text-xs text-tone-400">{page} / {last}</span>
      {page < last ? <Link href={href(page + 1)} className={cls}>{t.next} →</Link> : <span />}
    </nav>
  );
}
