/**
 * サイト全体の配色テーマ。<html data-theme> に入れた値で app/globals.css の色が一括で切り替わる。
 *
 * - 手動: 管理画面の「サイトの配色テーマ」(platform_settings.site_theme)で default / christmas / beauty / nature に固定。
 * - 自動: 未設定(null)なら、日本時間の12/1〜12/25は christmas、それ以外は default。
 * - 管理画面・店舗ダッシュボード・スタッフ画面は常に default(配色を変えない)。
 */
export const SITE_THEMES = ["default", "christmas", "beauty", "nature"] as const;
export type SiteTheme = (typeof SITE_THEMES)[number];

export function isSiteTheme(value: unknown): value is SiteTheme {
  return typeof value === "string" && (SITE_THEMES as readonly string[]).includes(value);
}

/** テーマを当てない画面(管理系)。 */
export const THEME_EXCLUDED_PATH = /^\/(admin|dashboard|staff)(\/|$)/;

/** 手動指定 → 時期による自動判定 の順で決める。 */
export function resolveSiteTheme(pathname: string, manual: SiteTheme | null, now: Date = new Date()): SiteTheme {
  if (THEME_EXCLUDED_PATH.test(pathname)) return "default";
  if (manual) return manual;
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCMonth() === 11 && jst.getUTCDate() <= 25 ? "christmas" : "default";
}

/**
 * 描画前に <html data-theme> を決める小さなスクリプト(ページ表示の一瞬だけ別テーマが見えるのを防ぐ)。
 * resolveSiteTheme と同じ判定をブラウザ側で行う。
 */
export function themeInitScript(manual: SiteTheme | null): string {
  const m = JSON.stringify(manual);
  return `(function(){try{var p=location.pathname,t;if(${THEME_EXCLUDED_PATH}.test(p))t="default";else if(${m})t=${m};else{var d=new Date(Date.now()+324e5);t=d.getUTCMonth()===11&&d.getUTCDate()<=25?"christmas":"default"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
}
