import type { Metadata, Viewport } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { PetTabBar } from "@/components/pet/PetTabBar";
import { PetTopBar } from "@/components/pet/PetTopBar";
import { PAW_PATTERN } from "@/components/pet/ui";
import { HereLocationPing } from "@/components/pet/HereLocationPing";
import { PetConcierge } from "@/components/pet/PetConcierge";
import { getPetViewer } from "@/lib/pet/db";
import { AiConsentProvider } from "@/components/pet/AiConsent";
import { AppPushBridge } from "@/components/pet/AppPushBridge";

const rounded = M_PLUS_Rounded_1c({ weight: ["400", "700", "800"], subsets: ["latin"], display: "swap", preload: false });

// ロカわんはアプリから開く入口だけで、検索結果には出さない
export const metadata: Metadata = {
  title: "ロカわん",
  robots: { index: false, follow: false },
  // ホーム画面に追加(PWA)。iPhoneはホーム画面に追加したときだけWebでも端末通知が届く
  manifest: "/pet.webmanifest",
  appleWebApp: { capable: true, title: "ロカわん", statusBarStyle: "default" },
  // iPhoneのSafariで開くと、上にApple公式の「ロカわん - 入手」バナーが出る(アプリ導入済みなら「開く」)
  other: { "apple-itunes-app": "app-id=6835396460" },
};

export const viewport: Viewport = { themeColor: "#FFF7EC" };

export default async function PetLayout({ children }: { children: React.ReactNode }) {
  // 「いまいる場所でも受け取る」がオンの人だけ、開いたときに現在地を送る
  const viewer = await getPetViewer();
  let hereEnabled = false;
  let aiConsent = false;
  if (viewer) {
    const { data } = await viewer.supabase.from("locapass_pet_owner_settings").select("here_alert_opt_in, ai_consent_at").eq("user_id", viewer.userId).maybeSingle();
    hereEnabled = Boolean(data?.here_alert_opt_in);
    aiConsent = Boolean(data?.ai_consent_at);
  }
  return (
    <div
      className={`${rounded.className} -mb-20 min-h-screen bg-[#FFF7EC] text-[#4A3426] md:mb-0`}
      style={{ backgroundImage: PAW_PATTERN, backgroundSize: "64px 64px" }}
    >
      <AiConsentProvider initialGranted={aiConsent} loggedIn={Boolean(viewer)}>
        <HereLocationPing enabled={hereEnabled} />
        <AppPushBridge loggedIn={Boolean(viewer)} />
        <PetTopBar />
        <div className="mx-auto w-full max-w-md px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-2">{children}</div>
        <PetTabBar />
        <PetConcierge />
      </AiConsentProvider>
    </div>
  );
}
