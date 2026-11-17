import type { Metadata } from "next";
import Link from "next/link";
import { PetCard, PetSectionTitle } from "@/components/pet/ui";
import { PwaInstallButton } from "@/components/pet/PwaInstallButton";

const APP_ID = "6835396460";
const APP_STORE_URL = `https://apps.apple.com/jp/app/id${APP_ID}`;
const TITLE = "ロカわん - 愛犬の手帳アプリ";
const DESCRIPTION =
  "いっしょに行った旅行やドッグランの思い出、日々の成長から、ワクチン・通院の記録まで気軽に管理。一緒に入れるお店探しも、もしもの時の迷子SOSも、愛犬との毎日はこれ1本で完結するアプリ。";

// SNS(X・Facebook・LINEなど)で共有したときの、カードの画像と文。この画像を押すと、このページに来る。
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // /pet 全体は検索に出さない設定だが、この紹介ページだけは出してよい
  robots: { index: true, follow: true },
  alternates: { canonical: "https://locapass.net/pet/app" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://locapass.net/pet/app",
    type: "website",
    siteName: "ロカわん",
    images: [{ url: "https://locapass.net/pet/app/ogp.png", width: 1200, height: 630, alt: "ロカわん 愛犬の手帳アプリ" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["https://locapass.net/pet/app/ogp.png"] },
  // iPhoneのSafariで開くと、上に「ロカわん - 入手」の帯が出る(Apple公式の仕組み)
  other: { "apple-itunes-app": `app-id=${APP_ID}` },
};

const FEATURES = [
  { emoji: "📒", title: "うちの子手帳", body: "ワクチン証明や鑑札は、撮るだけで記録。通院の記録、成長日誌、体重グラフもまとめて管理できます。" },
  { emoji: "🆘", title: "迷子さがし", body: "迷子のお知らせを、近くの飼い主さんに届けます。見つけた人は、会員登録なしでも通報できます。" },
  { emoji: "🗺️", title: "おでかけ", body: "ドッグラン、動物病院、トリミング、ペットと一緒に入れるお店を、地図で探せます。" },
  { emoji: "📸", title: "うちの子自慢", body: "お気に入りの写真を公開して、肉球(いいね)をもらえます。位置情報なしで公開できます。" },
];

/** ロカわんの紹介ページ(ダウンロードの入口)。SNSの投稿から、ここへ来てもらう。 */
export default function PetAppLandingPage() {
  const link = (ct: string) => `${APP_STORE_URL}?ct=${ct}`;
  return (
    <div className="pt-2">
      <PetCard className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pet/app/icon.png" alt="" width={96} height={96} className="mx-auto rounded-[22px] shadow-[0_6px_16px_-8px_rgba(160,80,30,0.5)]" />
        <h1 className="mt-3 text-2xl font-extrabold">ロカわん</h1>
        <p className="text-sm font-bold text-[#8A6A50]">愛犬の手帳アプリ</p>
        <p className="mt-3 text-sm leading-relaxed text-[#5C4535]">
          旅行やドッグランの思い出、日々の成長から、ワクチン・通院の記録まで。
          <br />
          愛犬との毎日は、これ1本で。
        </p>

        {/* App Store公式バッジ(形・色は変えない) */}
        <a href={link("web")} className="mt-5 inline-block" aria-label="App Storeからダウンロード">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pet/app/appstore-ja.svg" alt="App Storeからダウンロード" width={190} height={70} />
        </a>
        <p className="mt-2 text-[11px] text-[#B39C8C]">iPhone用のアプリです</p>
        <PwaInstallButton variant="card" />

        {/* パソコンで見ている人向け: スマホで読み取る */}
        <div className="mt-5 hidden border-t border-[#F0E2D2] pt-4 md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pet/app/qr.png" alt="ダウンロードのQRコード" width={140} height={140} className="mx-auto rounded-2xl border border-[#F0E2D2]" />
          <p className="mt-2 text-xs text-[#8A6A50]">パソコンで見ている方は、iPhoneで読み取ってください</p>
        </div>
      </PetCard>

      <PetSectionTitle emoji="🐾">できること</PetSectionTitle>
      <div className="grid gap-3">
        {FEATURES.map((f) => (
          <PetCard key={f.title} className="flex gap-3">
            <span className="text-2xl" aria-hidden>
              {f.emoji}
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold">{f.title}</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-[#5C4535]">{f.body}</p>
            </div>
          </PetCard>
        ))}
      </div>

      <div className="mt-6 text-center">
        <a href={link("web")} className="inline-block" aria-label="App Storeからダウンロード">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pet/app/appstore-ja.svg" alt="App Storeからダウンロード" width={190} height={70} />
        </a>
      </div>

      <p className="mt-6 px-2 text-center text-[11px] leading-relaxed text-[#B39C8C]">
        ロカわんは、街のお店や出かけ先を動画で探せる「LOCAPASS(ロカパス)」と同じアカウントで使えます。
        <br />
        <Link href="/privacy" className="underline">プライバシーポリシー</Link>
        <span className="mx-1">・</span>
        <Link href="/terms" className="underline">利用規約</Link>
      </p>
    </div>
  );
}
