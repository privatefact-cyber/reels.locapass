// @types/react-dom を入れていないため、使っている createPortal だけ型を宣言する
// (全画面の写真ビューアーを body 直下に描画するのに使用。components/CastPhotoGrid.tsx)。
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
