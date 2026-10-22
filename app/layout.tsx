import type { Metadata, Viewport } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { AppShell } from "@/components/AppShell";
import { ImageInteractionGuard } from "@/components/ImageInteractionGuard";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/getServerLocale";
import { localeDir } from "@/lib/i18n/locale";
import { createClient } from "@/lib/supabase/server";
import { isSiteTheme, themeInitScript } from "@/lib/theme";
import { ThemeSync } from "@/components/ThemeSync";
import { SiteHitBeacon } from "@/components/analytics/SiteHitBeacon";
import { fetchMyRoles, isPartnerOnly, homePathForRoles } from "@/lib/auth/roles";
import "./globals.css";

const SITE_META: Record<string, { brand: string; title: string; description: string; short: string; ogLocale: string }> = {
  ja: {
    brand: "LOCAPASS【ロカパス】",
    title: "LOCAPASS【ロカパス】| 街と人が繋がるリールメディア",
    description:
      "街が繋がる、人が繋がるリールメディア「LOCAPASS（ロカパス）」。最新のショート動画やリールから、エリアごとの人気スポットや話題の店舗、街のリアルな雰囲気をダイレクトに発見できます。",
    short: "街が繋がる、人が繋がるリールメディア「LOCAPASS（ロカパス）」。街や店舗のリアルな今をショート動画でお届け。",
    ogLocale: "ja_JP",
  },
  en: {
    brand: "LOCAPASS",
    title: "LOCAPASS | Reels media connecting towns and people",
    description:
      "LOCAPASS is a reels media that connects towns and people. Discover popular local spots, trending shops and the real atmosphere of each area through the latest short videos.",
    short: "LOCAPASS connects towns and people. See the real, right-now of local shops and places in short videos.",
    ogLocale: "en_US",
  },
  zh: {
    brand: "LOCAPASS",
    title: "LOCAPASS | 连接城市与人的短视频媒体",
    description: "LOCAPASS 是连接城市与人的短视频媒体。通过最新的短视频，直接发现各地区的人气景点、热门店铺和街头的真实氛围。",
    short: "LOCAPASS 连接城市与人。用短视频呈现店铺与街区的当下。",
    ogLocale: "zh_CN",
  },
  ar: {
    brand: "LOCAPASS",
    title: "LOCAPASS | منصة ريلز تربط المدن بالناس",
    description: "LOCAPASS منصة ريلز تربط المدن بالناس. اكتشف الأماكن الشهيرة والمتاجر الرائجة وأجواء كل منطقة عبر أحدث مقاطع الفيديو القصيرة.",
    short: "LOCAPASS تربط المدن بالناس. شاهد واقع المتاجر والأماكن الآن في مقاطع فيديو قصيرة.",
    ogLocale: "ar_AR",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const m = SITE_META[await getServerLocale()] ?? SITE_META.ja;
  return {
    // 自前で多言語化しているので、ブラウザの自動翻訳(Chrome等)の案内は出さない
    other: { google: "notranslate" },
    metadataBase: new URL("https://locapass.net"),
    title: { default: m.title, template: `%s | ${m.brand}` },
    description: m.description,
    keywords: ["LOCAPASS", "ロカパス", "リール", "ショート動画", "店舗情報", "スポット情報", "地域情報", "街歩き", "ローカルメディア"],
    openGraph: {
      title: m.title,
      description: m.description,
      siteName: "LOCAPASS",
      url: "https://locapass.net",
      locale: m.ogLocale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.short },
    alternates: { canonical: "https://locapass.net" },
  };
}

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
  const [
    {
      data: { user },
    },
    { data: settings },
    { data: portalRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // 管理画面で選んだ配色テーマ(null=自動)。LUXELAとは別の列。
    supabase.from("platform_settings").select("locapass_site_theme").eq("id", true).maybeSingle(),
    // 子ポータルのslug一覧。ヘッダー/ボトムナビの「イベント」を、子ポータル内ではそのポータル限定のページへ向けるため。
    supabase.from("locapass_portals").select("slug").eq("status", "active").neq("slug", ""),
  ]);
  const portalSlugs = (portalRows ?? []).map((p) => p.slug);
  const manualTheme = isSiteTheme(settings?.locapass_site_theme) ? settings.locapass_site_theme : null;

  // ヘッダーの「管理」ボタンは、ルート管理者(super_admin)でログインしているときだけ出す。
  const myRoles = user ? await fetchMyRoles(supabase) : null;
  const hasManagement = myRoles?.super_admin === true;
  // ヘッダーのアイコンの行き先。キャスト・スタッフだけのアカウントは、個人マイページ(ゲストページ)でなく自分の画面へ。
  const accountHref = isPartnerOnly(myRoles) ? homePathForRoles(myRoles) : "/mypage";
  let myPageAvatarUrl: string | null = null;
  let myPageInitial: string | null = null;
  if (user) {
    // スタッフ/パートナー本人としてログインしている場合は、それを最優先で表示する。
    // 一般会員(locapass_members)は`/mypage`初回アクセス時に「ゲスト」の行が自動作成されるため、
    // 後からlocapass_membersだけ見ると本人のスタッフ/パートナー情報より先にヒットしてしまい、
    // ヘッダーのアカウントアイコンがゲスト表示のままになる不具合があった。
    const [{ data: staffId }, { data: castId }] = await Promise.all([
      supabase.rpc("locapass_current_staff_member_id"),
      supabase.rpc("locapass_current_cast_id"),
    ]);

    if (staffId) {
      const { data: staff } = await supabase
        .from("locapass_shop_staff_members")
        .select("name, avatar_url")
        .eq("id", staffId)
        .maybeSingle();
      myPageAvatarUrl = staff?.avatar_url ?? null;
      myPageInitial = staff?.name?.slice(0, 1) ?? null;
    } else if (castId) {
      const { data: cast } = await supabase
        .from("locapass_cast_members")
        .select("name, avatar_url")
        .eq("id", castId)
        .maybeSingle();
      myPageAvatarUrl = cast?.avatar_url ?? null;
      myPageInitial = cast?.name?.slice(0, 1) ?? null;
    } else {
      const { data: profile } = await supabase
        .from("locapass_members")
        .select("nickname, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      myPageAvatarUrl = profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null;
      myPageInitial = profile?.nickname?.slice(0, 1) ?? null;
    }
  }

  return (
    // data-theme は描画前にスクリプトで決める(時期・管理画面かどうかで変わるため、サーバーとの差分警告は抑止)。
    <html lang={locale} translate="no" dir={localeDir(locale)} data-theme="default" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(manualTheme) }} />
      </head>
      <body className="min-h-screen bg-page text-main pb-20 md:pb-0">
        <ThemeSync manual={manualTheme} />
        <SiteHitBeacon />
        <ImageInteractionGuard />
        <LocaleProvider initialLocale={locale}>
          <SiteChrome
            myPageAvatarUrl={myPageAvatarUrl}
            myPageInitial={myPageInitial}
            portalSlugs={portalSlugs}
            hasManagement={hasManagement}
            accountHref={accountHref}
          />

          {/* メインコンテンツ(PC幅ではワイドに広がる、リール一覧はデスクトップでグリッド表示に切り替わる) */}
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
