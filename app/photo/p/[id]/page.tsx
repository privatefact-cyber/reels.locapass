import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PhotoFeed } from "@/components/photo/PhotoFeed";
import { getPhotoPostById } from "@/lib/photo/getPhotoPosts";
import { photoText } from "@/lib/photo/serverText";

export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 写真1枚の共有ページ(/photo/p/[id])。SNSに貼ったときに、その写真と場所名がカードで出る。 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const post = await getPhotoPostById(id);
  if (!post) return {};
  const title = `${post.spotName} | LOCAPASS`;
  const description = post.comment ?? post.address ?? "LOCA SNAP | LOCAPASS";
  const url = `https://locapass.net/photo/p/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // 画像は同じフォルダの opengraph-image.tsx(店名入りの横長カード)が自動で付く。
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PhotoSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await photoText();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const post = await getPhotoPostById(id);
  if (!post) notFound();

  return (
    <div className="space-y-4">
      <Link href="/photo" className="flex items-center gap-1 px-3 pt-3 text-sm text-tone-300 hover:text-main">
        <ChevronLeft size={18} />
        {t.backToPhotos}
      </Link>
      <PhotoFeed posts={[post]} areas={[]} areaSlug={null} hideToolbar initialPostId={post.id} />
      {/* 共有で見に来た人を、店舗ページと「自分も投稿」へつなぐ */}
      <div className="mx-3 space-y-3 rounded-2xl border border-tone-700 bg-tone-900/60 p-4 pb-5 text-center md:mx-auto md:max-w-md">
        <p className="text-sm text-tone-300">{t.shareFree}</p>
        {post.shop ? (
          <Link href={post.shop.href} className="block rounded-full border border-tone-500 px-4 py-2 text-sm font-medium text-main hover:bg-white/10">
            {t.viewShop(post.shop.name)}
          </Link>
        ) : null}
        <Link href="/photo/new" className="block rounded-full bg-cta-light px-4 py-2.5 text-sm font-bold text-on-cta-gold transition hover:bg-cta-hover">
          {t.shareCta}
        </Link>
      </div>
    </div>
  );
}
