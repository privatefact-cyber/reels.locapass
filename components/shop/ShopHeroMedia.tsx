"use client";

import { useState } from "react";
import { AutoplayVideo } from "@/components/portal/AutoplayVideo";
import { ShopMediaFallback } from "@/components/shop/ShopMediaFallback";

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
}: {
  url: string | null;
  type: "image" | "video";
  alt: string;
  category: string | null;
  seed: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
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
