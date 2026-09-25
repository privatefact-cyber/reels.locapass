"use client";

import { Check, Plus } from "lucide-react";
import { useShopFavorites } from "@/lib/reels/useFollows";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function ShopFollowButton({ shopId }: { shopId: string }) {
  const { favoritedShopIds, toggleShopFavorite } = useShopFavorites();
  const { t } = useLocale();
  const favorited = favoritedShopIds.has(shopId);

  return (
    <button
      type="button"
      onClick={() => toggleShopFavorite(shopId)}
      className={`mt-3 inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs font-semibold backdrop-blur-md transition ${
        favorited
          ? "border-main/30 bg-main/10 text-main"
          : "border-hl-300/60 bg-hl-300/10 text-hl-200 hover:bg-hl-300/20"
      }`}
    >
      {favorited ? (
        <>
          <Check size={12} /> {t.common.favorited}
        </>
      ) : (
        <>
          <Plus size={12} /> {t.common.addToFavorites}
        </>
      )}
    </button>
  );
}
