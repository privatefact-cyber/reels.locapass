import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { AppShell } from "@/components/AppShell";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://luxela.jp"),
  title: "LOCAPASS - ナイト＆キャスト特化リールメディア",
  description: "エリア・ジャンルから探せるナイトワークポータル",
  keywords: ["LOCAPASS", "ナイトワーク", "キャスト", "リール", "ポータル"],
  openGraph: {
    title: "LOCAPASS - ナイト＆キャスト特化リールメディア",
    description: "エリア・ジャンルから探せるナイトワークポータル",
    siteName: "LOCAPASS",
    url: "https://luxela.jp",
  },
  alternates: {
    canonical: "https://luxela.jp",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const locale = await getServerLocale();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let myPageAvatarUrl: string | null = null;
  let myPageInitial: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("locapass_members")
      .select("nickname, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    myPageAvatarUrl = profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null;
    myPageInitial = profile?.nickname?.slice(0, 1) ?? null;
  }

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-black text-white pb-20 md:pb-0">
        <LocaleProvider initialLocale={locale}>
          <SiteChrome myPageAvatarUrl={myPageAvatarUrl} myPageInitial={myPageInitial} />

          {/* メインコンテンツ(PC幅ではワイドに広がる、リール一覧はデスクトップでグリッド表示に切り替わる) */}
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
