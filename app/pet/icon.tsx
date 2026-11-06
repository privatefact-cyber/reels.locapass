import { ImageResponse } from "next/og";
import { PetAppIcon } from "./petAppIcon";

// ワンコ手帳のタブ・Androidのホーム画面用アイコン(/pet 以下のページだけ)
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<PetAppIcon size={512} />, size);
}
