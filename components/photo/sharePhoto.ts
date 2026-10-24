import type { PhotoPost } from "@/lib/photo/getPhotoPosts";

/** 写真1枚の共有URL(/photo/p/[id])。 */
export function photoShareUrl(post: Pick<PhotoPost, "id">): string {
  return new URL(`/photo/p/${post.id}`, window.location.origin).toString();
}

/** スマホは端末の共有画面、使えない環境ではURLをコピーする。コピーできたらtrueを返す。 */
export async function sharePhoto(post: Pick<PhotoPost, "id" | "spotName">): Promise<boolean> {
  const url = photoShareUrl(post);
  if (navigator.share) {
    try {
      await navigator.share({ title: `LOCAPASS | ${post.spotName}`, url });
    } catch {
      // キャンセル等は何もしない。
    }
    return false;
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
