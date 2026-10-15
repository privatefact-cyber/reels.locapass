import { ReelFeed, type ReelItem } from "@/components/ReelFeed";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { BetaLaunchModal } from "@/components/BetaLaunchModal";
import { getFeaturedShops } from "@/lib/shop/getFeaturedShops";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { getPortalFeedData } from "@/lib/reels/getPortalFeedData";
import Link from "next/link";
import { getActiveBoosts } from "@/lib/boost/getBoosts";
import { boostText } from "@/lib/boost/text";
import { getPhotoPosts } from "@/lib/photo/getPhotoPosts";

export const revalidate = 60;

export default async function TopPage() {
  const locale = await getServerLocale();
  const featuredShops = await getFeaturedShops(locale);

  // 全体トップは特定エリアに絞らず、全locapass_portalsを横断してshops/reelsを取得する。
  const { reels, shopItems, genreChoices, ads } = await getPortalFeedData(null);
  // PHOTOタブ用: ユーザー投稿写真の新着(失敗してもトップ全体は表示する)。
  const photos = await getPhotoPosts(null, 30)
    .then(({ posts }) => posts.map((p) => ({ id: p.id, imageUrl: p.imageUrl, spotName: p.spotName, placeKind: p.placeKind, isVideo: Boolean(p.videoUrl) })))
    .catch(() => []);

  // 緊急ブーストが掲載中ならトップに入口を出す(失敗してもトップ全体は表示する)。
  const boosts = await getActiveBoosts().catch(() => []);
  const bt = boostText(locale);

  // locapass_reels/locapass_shopsにはキャスト稼働スケジュールの概念が無いため、
  // NOWタブは常に空(受け皿はUI側に残るが、対応データが無い)。
  const nowReels: ReelItem[] = [];

  return (
    <div className="space-y-4">
      {/* 公開ローンチ告知。合言葉ゲート解除にあわせて、トップ初回訪問時にだけ出す。 */}
      <BetaLaunchModal />

      {/* トップの提携店舗特集(FEATURED)。運営がshops.featured_rankで選んだ店舗だけを、
          黒×ゴールドのコンパクトな見せ方で出す。1件も無ければ/×で閉じたら何も表示しない。 */}
      <FeaturedSection shops={featuredShops} />

      {boosts.length > 0 && (
        <Link
          href="/boost"
          className="mx-2 flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-black active:scale-[0.99]"
        >
          <span className="text-sm font-black">⚡ {bt.title}・{bt.limited}</span>
          <span className="rounded-full bg-black px-3 py-0.5 text-xs font-black text-amber-300">{boosts.length}</span>
        </Link>
      )}

      {/* リールフィード（検索・タグ絞り込み付き）。CASTタブはキャストが投稿したリール、
          SHOPタブは店舗のトップサムネイル（縦型メイン画像）グリッド。NOWは今まさに稼働中の
          パートナーの最新リール1本ずつのみを表示する。
          「本日の出勤」の一覧は店舗詳細ページ、フォロー中のみの出勤状況はマイページで
          それぞれ表示する(トップでは全パートナー分を出すと件数に上限がないため扱わない)。
          adsはシステム管理者が投稿するPRで、指定頻度でグリッド/リール一覧の両方に紛れ込ませる。 */}
      <ReelFeed reels={reels} nowReels={nowReels} shops={shopItems} genreChoices={genreChoices} ads={ads} photos={photos} boostCount={boosts.length} />
    </div>
  );
}
