"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// フォロー/お気に入りはlikeと違って匿名では成立しない(user_idがNOT NULL FKのため)。
// 未ログイン時はマイページのログインへ飛ばし、ログイン後に元の画面へ戻す。
function redirectToLogin() {
  const redirect = window.location.pathname + window.location.search;
  window.location.href = `/mypage/login?redirect=${encodeURIComponent(redirect)}`;
}

/** キャストのフォロー状態(一覧)とトグル操作。 */
export function useCastFollows() {
  const [followedCastIds, setFollowedCastIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: rows } = await supabase.from("locapass_cast_follows").select("cast_id").eq("user_id", uid);
      if (cancelled) return;
      setFollowedCastIds(new Set((rows ?? []).map((r) => r.cast_id)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleCastFollow(castId: string) {
    if (!userId) {
      redirectToLogin();
      return;
    }
    const supabase = createClient();
    const isFollowing = followedCastIds.has(castId);

    const next = new Set(followedCastIds);
    if (isFollowing) next.delete(castId);
    else next.add(castId);
    setFollowedCastIds(next);

    if (isFollowing) {
      await supabase.from("locapass_cast_follows").delete().eq("user_id", userId).eq("cast_id", castId);
    } else {
      await supabase.from("locapass_cast_follows").insert({ user_id: userId, cast_id: castId });
    }
  }

  return { followedCastIds, toggleCastFollow };
}

/** 店舗のお気に入り状態(一覧)とトグル操作。 */
export function useShopFavorites() {
  const [favoritedShopIds, setFavoritedShopIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: rows } = await supabase.from("locapass_shop_favorites").select("shop_id").eq("member_id", uid);
      if (cancelled) return;
      setFavoritedShopIds(new Set((rows ?? []).map((r) => r.shop_id)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleShopFavorite(shopId: string) {
    if (!userId) {
      redirectToLogin();
      return;
    }
    const supabase = createClient();
    const isFavorited = favoritedShopIds.has(shopId);

    const next = new Set(favoritedShopIds);
    if (isFavorited) next.delete(shopId);
    else next.add(shopId);
    setFavoritedShopIds(next);

    if (isFavorited) {
      await supabase.from("locapass_shop_favorites").delete().eq("member_id", userId).eq("shop_id", shopId);
    } else {
      await supabase.from("locapass_shop_favorites").insert({ member_id: userId, shop_id: shopId });
    }
  }

  return { favoritedShopIds, toggleShopFavorite };
}
