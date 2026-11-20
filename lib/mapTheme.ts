/**
 * 地図の見た目をサイトの配色テーマ(<html data-theme>)に合わせる。
 * OpenFreeMap の無料スタイル(APIキー不要)をテーマごとに割り当てる。違和感があれば THEME_MAP_STYLE だけ直せばよい。
 *  positron=白っぽくすっきり / liberty=カラフルで詳細 / bright=標準的な明るい地図 / dark=ほぼ黒 / fiord=青みの夜
 */
const BASE = "https://tiles.openfreemap.org/styles";
export const MAP_STYLE_LIGHT = `${BASE}/positron`;
export const MAP_STYLE_DARK = `${BASE}/dark`;

export type MapStyleName = "positron" | "liberty" | "bright" | "dark" | "fiord";

/** テーマ → 地図スタイル。ここに無いテーマ(default・nature など)は dark。 */
export const THEME_MAP_STYLE: Record<string, MapStyleName> = {
  cafe: "liberty",
  warm: "liberty",
  botanical: "liberty",
  pure: "positron",
  london: "positron",
  beauty: "positron",
  newyork: "bright",
  coastal: "bright",
  christmas: "fiord",
  default: "dark",
};

export function mapStyleForTheme(theme: string | null | undefined): string {
  return `${BASE}/${THEME_MAP_STYLE[theme ?? ""] ?? "dark"}`;
}

/** いまのページのテーマに合う地図スタイル(ブラウザ専用)。 */
export function currentMapStyle(): string {
  return mapStyleForTheme(typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme"));
}
