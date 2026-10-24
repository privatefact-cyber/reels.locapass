"use client";

import { useState } from "react";
import { AutoplayVideo } from "@/components/portal/AutoplayVideo";
import { ShopMediaFallback } from "@/components/shop/ShopMediaFallback";
import { HeroYoutubeBackground } from "@/components/shop/HeroYoutubeBackground";

/**
 * 店舗ページのヒーロー(動画/写真)。写真が無い、または読み込めない(リンク切れ)ときは、真っ黒にせず
 * イメージ写真/動画(ShopMediaFallback)に切り替える。
 */
export function ShopHeroMedia({
  url,
  type,
  alt,
  category,
  seed,
  youtubeId,
  preferYoutube = false,
}: {
  url: string | null;
  type: "image" | "video";
  alt: string;
  category: string | null;
  seed: string;
  /** 写真が無い/読み込めないとき、店舗の動画紹介(YouTube)があれば背景に流す。 */
  youtubeId?: string | null;
  /** 店舗がヒーローにYouTubeを選んでいるときは、写真があってもYouTubeを優先する。 */
  preferYoutube?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  if (preferYoutube && youtubeId) return <HeroYoutubeBackground videoId={youtubeId} title={alt} />;
  if (!url || broken) {
    if (youtubeId) return <HeroYoutubeBackground videoId={youtubeId} title={alt} />;
    return <ShopMediaFallback category={category} seed={seed} name={alt} allowVideo />;
  }
  if (type === "video") return <AutoplayVideo src={url} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}
