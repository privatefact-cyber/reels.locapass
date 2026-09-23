import type { Metadata, Viewport } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { AppShell } from "@/components/AppShell";
import { ImageInteractionGuard } from "@/components/ImageInteractionGuard";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { localeDir } from "@/lib/i18n/locale";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://reels.locapass.net"),
  title: {
    default: "LOCAPASS【ロカパス】| 街と人が繋がるリールメディア",
    template: "%s | LOCAPASS【ロカパス】",
  },
  description:
    "街が繋がる、人が繋がるリールメディア「LOCAPASS（ロカパス）」。最新のショート動画やリールから、エリアごとの人気スポットや話題の店舗、街のリアルな雰囲気をダイレクトに発見できます。",
  keywords: [
    "LOCAPASS",
    "ロカパス",
    "リール",
    "ショート動画",
    "店舗情報",
    "スポット情報",
    "地域情報",
    "街歩き",
    "ローカルメディア",
  ],
  openGraph: {
    title: "LOCAPASS【ロカパス】| 街と人が繋がるリールメディア",
    description:
      "街が繋がる、人が繋がるリールメディア「LOCAPASS（ロカパス）」。最新のショート動画やリールから、エリアごとの人気スポットや話題の店舗の魅力をリアルにお届けします。",
    siteName: "LOCAPASS",
    url: "https://reels.locapass.net",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LOCAPASS【ロカパス】| 街と人が繋がるリールメディア",
    description:
      "街が繋がる、人が繋がるリールメディア「LOCAPASS（ロカパス）」。街や店舗のリアルな今をショート動画でお届け。",
  },
  alternates: {
    canonical: "https://reels.locapass.net",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
    <html lang={locale} dir={localeDir(locale)}>
      <body className="min-h-screen bg-black text-white pb-20 md:pb-0">
        <ImageInteractionGuard />
        <LocaleProvider initialLocale={locale}>
          <SiteChrome myPageAvatarUrl={myPageAvatarUrl} myPageInitial={myPageInitial} />

          {/* メインコンテンツ(PC幅ではワイドに広がる、リール一覧はデスクトップでグリッド表示に切り替わる) */}
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
