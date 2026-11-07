import { ImageResponse } from "next/og";
import { PetAppIcon } from "./petAppIcon";

// ロカわんをiPhoneのホーム画面に追加したときのアイコン(/pet 以下のページだけ、サイト共通のアイコンの代わりに使う)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<PetAppIcon size={180} />, size);
}
