import type { Metadata } from "next";
import { PhotoFeed } from "@/components/photo/PhotoFeed";
import { PhotoIntroModal } from "@/components/photo/PhotoIntroModal";
import { getPhotoPosts } from "@/lib/photo/getPhotoPosts";
import { photoText } from "@/lib/photo/serverText";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await photoText();
  return { title: t.title, description: t.description, alternates: { canonical: "https://locapass.net/photo" } };
}

export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ area?: string; view?: string }> }) {
  const { area, view } = await searchParams;
  const areaSlug = area && /^[a-z0-9_-]{1,40}$/i.test(area) ? area : null;
  // 穴場(掲載店ではない場所ごとのまとめ)は、より多くの投稿から場所を作るため多めに取る。
  const { posts, areas } = await getPhotoPosts(areaSlug, view === "spots" ? 300 : undefined);
  return (
    <>
      <PhotoIntroModal />
      <PhotoFeed posts={posts} areas={areas} areaSlug={areaSlug} initialView={view === "map" ? "map" : view === "spots" ? "spots" : "grid"} />
    </>
  );
}
