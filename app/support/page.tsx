import type { Metadata } from "next";
import { docsFor } from "@/lib/support/docs";
import { SupportCenter } from "@/components/support/SupportCenter";

export const metadata: Metadata = { title: "サポート・使い方 | locapass", alternates: { canonical: "https://locapass.net/support" } };

export default function SupportPage() {
  // 一般向け。店舗の管理者でも、ここにはお客様向けの内容だけを出す(店舗向けは管理画面の中のサポート)。
  const docs = docsFor(["user"]).map(({ id, audience, title, body }) => ({ id, audience, title, body }));
  return <SupportCenter docs={docs} audience="user" />;
}
