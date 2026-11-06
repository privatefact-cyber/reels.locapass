"use client";

import { usePathname } from "next/navigation";
import { AiInquiryWidget } from "@/components/AiInquiryWidget";

/**
 * ワンコ手帳のコンシェルジュAI(LOCAPASSと同じAI・同じ会話)。配色だけワンコ手帳(theme="pet")。
 * 下のタブが高いので、その上に浮かせる。おでかけ(全画面地図)では、引き出しと重ならないよう地図の右上(ズームの下)に置く。
 */
export function PetConcierge() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/pet/spots")) {
    return <AiInquiryWidget theme="pet" placement="map" positionClassName="fixed right-3 top-[calc(env(safe-area-inset-top)+190px)] z-[60] flex flex-col-reverse items-end" />;
  }
  return <AiInquiryWidget theme="pet" positionClassName="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-[60] md:bottom-24" />;
}
