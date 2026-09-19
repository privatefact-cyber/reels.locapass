import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { dictionaries } from "@/lib/i18n/dictionaries";

// ページ遷移のあいだ、次のページのサーバー側データ取得が終わるまで一瞬何も表示されず
// 「タップしたのに反応が無い」と感じられる問題への対応。個別にloading.tsxを持たない
// ルート全てで、遷移直後にこれが即座に出る(App Routerの規約:同階層にPage用の
// 専用loading.tsxが無ければこれがフォールバックとして使われる)。
export default async function Loading() {
  const locale = await getServerLocale();
  const t = dictionaries[locale];
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-gold"
        role="status"
        aria-label={t.common.loading}
      />
    </div>
  );
}
