import { DashboardTranslator } from "@/components/locapass-dashboard/DashboardTranslator";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import catalog from "@/lib/dashboard-i18n/catalog.json";

/**
 * 管理画面は文言が日本語で書かれていて、日本語以外の言語で開いたときは、翻訳カタログで差し替える
 * (scripts/translate-dashboard-ui.ts でカタログを作る。外国人のオーナーも使えるようにするため)。
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();
  // 表示言語ぶんだけをクライアントへ渡す(全言語を送らない)。
  const slice: Record<string, string> =
    locale === "ja"
      ? {}
      : Object.fromEntries(
          Object.entries(catalog as Record<string, Partial<Record<string, string>>>)
            .map(([key, value]) => [key, value[locale]] as const)
            .filter((entry): entry is readonly [string, string] => !!entry[1]),
        );
  return (
    <DashboardTranslator locale={locale} catalog={slice}>
      {children}
    </DashboardTranslator>
  );
}
