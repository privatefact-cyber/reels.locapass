import type { Metadata } from "next";
import { PhotoFeed } from "@/components/photo/PhotoFeed";
import { getPhotoPosts } from "@/lib/photo/getPhotoPosts";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "みんなのフォト",
  description: "街で撮られたユーザー投稿の写真を、エリアごとに見られます。",
  alternates: { canonical: "https://locapass.net/photo" },
};

export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ area?: string; view?: string }> }) {
  const { area, view } = await searchParams;
  const areaSlug = area && /^[a-z0-9_-]{1,40}$/i.test(area) ? area : null;
  const { posts, areas } = await getPhotoPosts(areaSlug);
  return <PhotoFeed posts={posts} areas={areas} areaSlug={areaSlug} initialView={view === "map" ? "map" : "grid"} />;
}
