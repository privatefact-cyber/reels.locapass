import { Camera, MapPin } from "lucide-react";
import type { JournalPost } from "@/lib/journal/posts";

/**
 * 記事の表紙。写真があれば写真、無ければサイトの色の飾りを出す(写真は後から差し替えられる)。
 * 大きさは呼び出し側の className(aspect-*)で決める。画面の最上部に出す表紙は eager(すぐ読み込む)にする。
 */
export function Cover({ post, className = "", eager = false }: { post: JournalPost; className?: string; eager?: boolean }) {
  if (post.cover) {
    return (
      <div className={`relative overflow-hidden bg-panel-950 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.cover.src} alt={post.cover.alt} loading={eager ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }
  const Icon = post.category === "tips" ? MapPin : Camera;
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-hl-400/30 via-panel-950 to-black ${className}`}>
      <Icon size={36} className="text-hl-400/70" aria-hidden />
    </div>
  );
}
