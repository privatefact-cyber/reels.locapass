import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { PetTabBar } from "@/components/pet/PetTabBar";
import { PetTopBar } from "@/components/pet/PetTopBar";
import { PAW_PATTERN } from "@/components/pet/ui";

const rounded = M_PLUS_Rounded_1c({ weight: ["400", "700", "800"], subsets: ["latin"], display: "swap", preload: false });

// ワンコ手帳はアプリから開く入口だけで、検索結果には出さない
export const metadata: Metadata = {
  title: "ワンコ手帳",
  robots: { index: false, follow: false },
};

export default function PetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${rounded.className} -mb-20 min-h-screen bg-[#FFF7EC] text-[#4A3426] md:mb-0`}
      style={{ backgroundImage: PAW_PATTERN, backgroundSize: "64px 64px" }}
    >
      <PetTopBar />
      <div className="mx-auto w-full max-w-md px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-2">{children}</div>
      <PetTabBar />
    </div>
  );
}
