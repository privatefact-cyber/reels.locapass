import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { PetTabBar } from "@/components/pet/PetTabBar";
import { PetTopBar } from "@/components/pet/PetTopBar";
import { PAW_PATTERN } from "@/components/pet/ui";
import { HereLocationPing } from "@/components/pet/HereLocationPing";
import { getPetViewer } from "@/lib/pet/db";

const rounded = M_PLUS_Rounded_1c({ weight: ["400", "700", "800"], subsets: ["latin"], display: "swap", preload: false });

// ワンコ手帳はアプリから開く入口だけで、検索結果には出さない
export const metadata: Metadata = {
  title: "ワンコ手帳",
  robots: { index: false, follow: false },
};

export default async function PetLayout({ children }: { children: React.ReactNode }) {
  // 「いまいる場所でも受け取る」がオンの人だけ、開いたときに現在地を送る
  const viewer = await getPetViewer();
  let hereEnabled = false;
  if (viewer) {
    const { data } = await viewer.supabase.from("locapass_pet_owner_settings").select("here_alert_opt_in").eq("user_id", viewer.userId).maybeSingle();
    hereEnabled = Boolean(data?.here_alert_opt_in);
  }
  return (
    <div
      className={`${rounded.className} -mb-20 min-h-screen bg-[#FFF7EC] text-[#4A3426] md:mb-0`}
      style={{ backgroundImage: PAW_PATTERN, backgroundSize: "64px 64px" }}
    >
      <HereLocationPing enabled={hereEnabled} />
      <PetTopBar />
      <div className="mx-auto w-full max-w-md px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-2">{children}</div>
      <PetTabBar />
    </div>
  );
}
