/**
 * 地図の見た目(明るい/暗い)をサイトの配色テーマ(<html data-theme>)に合わせる。
 * 明るいテーマのときは明るい地図、それ以外(default など)は暗い地図。ブラウザ側(地図の初期化時)で呼ぶ。
 */
export const MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
export const MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

/** 明るい地図を使うテーマ。 */
export const LIGHT_MAP_THEMES: readonly string[] = ["cafe", "beauty", "coastal", "pure", "warm", "botanical", "newyork", "london"];

export function mapStyleForTheme(theme: string | null | undefined): string {
  return LIGHT_MAP_THEMES.includes(theme ?? "") ? MAP_STYLE_LIGHT : MAP_STYLE_DARK;
}

/** いまのページのテーマに合う地図スタイル(ブラウザ専用)。 */
export function currentMapStyle(): string {
  return mapStyleForTheme(typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme"));
}
