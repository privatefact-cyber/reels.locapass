import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PhotoFeed } from "@/components/photo/PhotoFeed";
import { PhotoProfileStats } from "@/components/photo/PhotoProfileStats";
import { getMemberPhotos } from "@/lib/photo/getPhotoPosts";

export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ memberId: string }> }): Promise<Metadata> {
  const { memberId } = await params;
  if (!UUID.test(memberId)) return {};
  const data = await getMemberPhotos(memberId);
  return data ? { title: `${data.profile.name}のフォト` } : {};
}

export default async function MemberPhotoPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  if (!UUID.test(memberId)) notFound();
  const data = await getMemberPhotos(memberId);
  if (!data) notFound();
  const { profile, posts } = data;

  return (
    <div className="space-y-4">
      <Link href="/photo" className="flex items-center gap-1 px-3 pt-3 text-sm text-tone-300 hover:text-main">
        <ChevronLeft size={18} />
        みんなのフォト
      </Link>

      <header className="flex items-center gap-4 px-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-tone-800 text-2xl text-tone-300">
            {profile.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="truncate text-lg font-medium text-main">{profile.name}</h1>
          <PhotoProfileStats memberId={profile.memberId} stats={profile} />
        </div>
      </header>

      <PhotoFeed posts={posts} areas={[]} areaSlug={null} />
    </div>
  );
}
