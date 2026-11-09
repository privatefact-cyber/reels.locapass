import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/i18n/LocaleLink";
import { ChevronLeft } from "lucide-react";
import { ReelLoopFeed } from "@/components/ReelLoopFeed";
import { getReelById } from "@/lib/reels/getReelById";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { shopPath } from "@/lib/locapass/publicUrls";
import { localizedPageUrls } from "@/lib/i18n/metadata";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 60;

/** リール1本の共有ページ(/reel/[id])。SNSに貼ったときに、その動画のサムネイルと店名がカードで出る。 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const reel = await getReelById(id);
  if (!reel) return {};
  const title = `${reel.shopName} | LOCAPASS`;
  const description = reel.caption?.trim() || `${reel.castName} | LOCAPASS`;
  const { url, alternates } = await localizedPageUrls(`/reel/${id}`);
  return {
    title,
    description,
    alternates,
    // 画像は同じフォルダの opengraph-image.tsx(サムネイル+店名の横長カード)が自動で付く。
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ReelSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getServerLocale();
  const reel = await getReelById(id, locale);
  if (!reel) notFound();

  // 検索結果に動画として出せるよう、動画の構造化データ(VideoObject)を付ける。サムネイルが無いものは付けない(Googleの必須項目)。
  const first = reel.media[0];
  const thumbnail = first ? (first.type === "video" ? first.poster : first.url) : null;
  const embedUrl = reel.embed?.provider === "youtube" ? `https://www.youtube.com/embed/${reel.embed.ref}`
    : reel.embed?.provider === "tiktok" ? `https://www.tiktok.com/player/v1/${reel.embed.ref}`
    : undefined;
  const videoJsonLd = thumbnail ? {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${reel.shopName} | LOCAPASS`,
    description: reel.caption?.trim() || `${reel.shopName} | LOCAPASS`,
    thumbnailUrl: [thumbnail],
    uploadDate: reel.createdAt,
    ...(embedUrl ? { embedUrl } : first?.type === "video" ? { contentUrl: first.url } : {}),
    publisher: { "@type": "Organization", name: "LOCAPASS", url: "https://locapass.net" },
  } : null;

  return (
    <div className="space-y-4">
      {videoJsonLd && <JsonLd data={videoJsonLd} />}
      <Link href={shopPath(reel.portalSlug, reel.shopSlug)} className="flex items-center gap-1 px-3 pt-3 text-sm text-tone-300 hover:text-main">
        <ChevronLeft size={18} />
        {reel.shopName}
      </Link>
      <ReelLoopFeed reels={[reel]} loop={false} />
    </div>
  );
}
