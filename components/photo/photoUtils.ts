import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { resizedUrl } from "@/lib/images/imgUrl";

// 自前の縮小API(/api/img)で縮小して配信する(Supabaseの画像変換は枚数課金のため使わない)。元画像は3000px超あるため、
// 格子(正方形)は小さく、全画面ビューは幅を絞って読み込む。変換できないURLはそのまま使う。
export function photoResized(url: string, width: number, square: boolean) {
  // 正方形は枠いっぱいに切り抜く(cover)。それ以外は、幅だけ指定すると縦長写真が細い帯になるので、
  // 縦横どちらにも上限を付けて「縦横比を保ったまま収める」(contain)。
  return resizedUrl(url, square ? { width, height: width, fit: "cover" } : { width, height: width * 2, fit: "contain" }) ?? url;
}

export function photoRouteUrl(post: PhotoPost) {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${post.latitude},${post.longitude}`;
  return post.placeId ? `${base}&destination_place_id=${encodeURIComponent(post.placeId)}` : base;
}
