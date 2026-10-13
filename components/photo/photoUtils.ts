import type { PhotoPost } from "@/lib/photo/getPhotoPosts";

// Supabase Storageの画像変換(render/image)で縮小して配信する。元画像は3000px超あるため、
// 格子(正方形)は小さく、全画面ビューは幅を絞って読み込む。変換できないURLはそのまま使う。
export function photoResized(url: string, width: number, square: boolean) {
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  const u = new URL(url.replace(marker, "/storage/v1/render/image/public/"));
  u.searchParams.set("width", String(width));
  if (square) {
    u.searchParams.set("height", String(width));
    u.searchParams.set("resize", "cover");
  } else {
    // 幅だけ指定すると高さが元のまま残り、中央が切り取られてしまう(縦長写真が細い帯になる)。
    // 縦横どちらにも上限を付けて「縦横比を保ったまま収める」(contain)にする。
    u.searchParams.set("height", String(width * 2));
    u.searchParams.set("resize", "contain");
  }
  return u.toString();
}

export function photoRouteUrl(post: PhotoPost) {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${post.latitude},${post.longitude}`;
  return post.placeId ? `${base}&destination_place_id=${encodeURIComponent(post.placeId)}` : base;
}
