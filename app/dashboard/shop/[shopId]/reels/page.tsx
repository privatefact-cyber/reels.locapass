import { redirect } from "next/navigation";

/** 「投稿」メニューに統合した(リールのタブ)。古いURL・ブックマークはそちらへ移す。 */
export default async function LegacyReelsRedirect({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(`/dashboard/shop/${shopId}/posts?tab=reel`);
}
