import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PREFECTURE_SLUG, slugToArea } from "@/lib/seo/area";
import { createClient } from "@/lib/supabase/server";
import { VenueMapExplorer } from "@/components/map/VenueMapExplorer";

export const revalidate = 60;

type PageParams = { prefecture: string; city: string };

function resolveArea(params: PageParams) {
  if (params.prefecture !== PREFECTURE_SLUG) return null;
  return slugToArea(params.city);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const area = resolveArea(await params);
  if (!area) return { title: "ページが見つかりません | LOCAPASS" };
  const title = `${area}のマップで探す｜出勤中のキャストをリールでチェック - LOCAPASS`;
  const description = `${area}エリアの店舗をGPSマップと縦型動画で直感的に探せます。近くの店舗、出勤中のキャストを今すぐチェック。`;
  return { title, description };
}

/**
 * エリア指定のマップ(一覧ページからの導線とSEO用)。
 * サーバーで用意するのは「そのエリアの店舗が収まる範囲」だけで、店舗データ自体は
 * クライアントが表示範囲ぶんずつ app/api/venues から取る。
 */
export default async function AreaMapPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = await params;
  const area = resolveArea(resolvedParams);
  if (!area) notFound();

  // 中心を出すための最小限のクエリ(座標2列だけ)。カードデータは引かない。
  const supabase = await createClient();
  const { data } = await supabase
    .from("locapass_shops")
    .select("lat, lng")
    .eq("status", "active")
    .eq("area", area)
    .not("lat", "is", null)
    .not("lng", "is", null);

  const coords = data ?? [];
  if (coords.length === 0) notFound();

  const lats = coords.map((c) => c.lat as number);
  const lngs = coords.map((c) => c.lng as number);
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
  const center = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };

  return <VenueMapExplorer initialCenter={center} initialBounds={bounds} />;
}
