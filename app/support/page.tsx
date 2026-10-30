import type { Metadata } from "next";
import { docsFor } from "@/lib/support/docs";
import { SupportCenter } from "@/components/support/SupportCenter";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { supportText } from "@/lib/support/text";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${supportText(locale).title} | locapass`, alternates: { canonical: "https://locapass.net/support" } };
}

export default async function SupportPage() {
  const locale = await getServerLocale();
  // 一般向け。店舗の管理者でも、ここにはお客様向けの内容だけを出す(店舗向けは管理画面の中のサポート)。
  const docs = docsFor(["user"], locale).map(({ id, audience, title, body }) => ({ id, audience, title, body }));
  return <SupportCenter docs={docs} audience="user" />;
}
