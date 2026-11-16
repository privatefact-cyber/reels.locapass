/**
 * LINEログインの戻り先パス。
 * ロカわんのiOSアプリ(User-Agentに LocaWanApp が付く)から始めたときだけ、アプリ専用の戻り先を使う。
 * アプリ専用の戻り先は Universal Link(public/.well-known/apple-app-site-association)に登録してあり、
 * LINEアプリで承認したあと、Safariではなくロカわんアプリ本体で開く(=ログイン開始時のCookieが残っている)。
 * 通常のWebからの流れは今までどおり /api/auth/line/callback。
 * LINE Developers の「コールバックURL」に両方を登録しておく必要がある。
 */
export const LINE_CALLBACK_PATH = "/api/auth/line/callback";
export const LINE_APP_CALLBACK_PATH = "/api/auth/line/app-callback";

export function lineCallbackPathFor(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  return ua.includes("LocaWanApp") ? LINE_APP_CALLBACK_PATH : LINE_CALLBACK_PATH;
}
