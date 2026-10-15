import type { Metadata } from "next";
import { BoostFeed } from "@/components/boost/BoostFeed";
import { getActiveBoosts } from "@/lib/boost/getBoosts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "⚡ 緊急ブースト | locapass",
  description: "ドタキャン・作りすぎ…1時間限定のお得情報。見てそのままお店へ。",
  alternates: { canonical: "https://locapass.net/boost" },
};

export default async function BoostPage() {
  const items = await getActiveBoosts();
  return <BoostFeed initial={items} />;
}
