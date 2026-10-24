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
  const description = post.comment ?? post.address ?? "LOCAPASS みんなの写真";
  const url = `https://locapass.net/photo/p/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: [{ url: post.imageUrl }], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [post.imageUrl] },
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
    </div>
  );
}
