import type { Metadata } from "next";
import { BoostDetail } from "@/components/boost/BoostDetail";
import { getActiveBoost } from "@/lib/boost/getBoosts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const b = await getActiveBoost(id);
  return { title: b ? `⚡ ${b.title} | ${b.shop.name}` : "⚡ 緊急ブースト | locapass", robots: { index: false } };
}

export default async function BoostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoostDetail boost={await getActiveBoost(id)} />;
}
