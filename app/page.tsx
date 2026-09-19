import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { getPortalFeedData } from "@/lib/reels/getPortalFeedData";

export const revalidate = 60;

export default async function TopPage() {
  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);

  // 全体トップは特定エリアに絞らず、全locapass_portalsを横断してshops/reelsを取得する。
  const { reels, shopItems, genreChoices, ads } = await getPortalFeedData(null);

  // locapass_reels/locapass_shopsにはキャスト稼働スケジュールの概念が無いため、
  // NOWタブは常に空(受け皿はUI側に残るが、対応データが無い)。
  const nowReels: ReelItem[] = [];

  return (
    <div className="space-y-4">
      {/* トップの提携店舗特集(FEATURED)。運営がshops.featured_rankで選んだ店舗だけを、
          黒×ゴールドのコンパクトな見せ方で出す。1件も無ければ/×で閉じたら何も表示しない。 */}
      <FeaturedSection shops={featuredShops} />

      {/* リールフィード（検索・タグ絞り込み付き）。CASTタブはキャストが投稿したリール、
          SHOPタブは店舗のトップサムネイル（縦型メイン画像）グリッド。NOWは今まさに稼働中の
          キャストの最新リール1本ずつのみを表示する。
          「本日の出勤」の一覧は店舗詳細ページ、フォロー中のみの出勤状況はマイページで
          それぞれ表示する(トップでは全キャスト分を出すと件数に上限がないため扱わない)。
          adsはシステム管理者が投稿するPRで、指定頻度でグリッド/リール一覧の両方に紛れ込ませる。 */}
      <ReelFeed reels={reels} nowReels={nowReels} shops={shopItems} genreChoices={genreChoices} ads={ads} />
    </div>
  );
}
