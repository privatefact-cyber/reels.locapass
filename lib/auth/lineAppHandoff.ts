import crypto from "node:crypto";

/**
 * ロカわんiOSアプリ(WebView)から始めたLINEログインを、Safariを経由して完了させるための共通処理。
 *
 * 背景: LINEアプリで承認したあと、戻り先はアプリではなくSafariで開く(LINEのページからのリダイレクトなので
 * Universal Linkでもアプリは開かない)。Safariには「ログイン開始時のCookie」が無いため、そのままでは失敗する。
 * そこで、
 *  1. アプリ発のとき state を "app." で始める(Cookieが無くてもアプリ発だと分かる)
 *  2. nonce は state から計算できる値にする(Cookieが無くても id_token の検証ができる)
 *  3. Safari側で認証を終え、カスタムURL(locawan://)でアプリに受け渡す
 *  4. アプリ側のWebView(ログイン開始時のCookieを持っている)が、state の一致を確かめてからセッションを作る
 * 4で、他人が始めたログインを自分のアプリに流し込まれる攻撃(ログインCSRF)を防いでいる。
 */
export const APP_STATE_PREFIX = "app.";
export const APP_URL_SCHEME = "locawan";

export function isAppRequest(request: Request): boolean {
  return (request.headers.get("user-agent") ?? "").includes("LocaWanApp");
}

export function isAppState(state: string | null | undefined): state is string {
  return Boolean(state && state.startsWith(APP_STATE_PREFIX));
}

/** アプリ発のログインで使う nonce。state から決まる値にして、Cookieが無いSafari側でも検証できるようにする。 */
export function appNonceFor(state: string): string {
  const secret = process.env.LINE_LOGIN_CHANNEL_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(`locawan-app-nonce:${state}`).digest("hex");
}

export function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

/** Safariに出す「ロカわんに戻る」ページ。自動でアプリを開き、開かなかったときのためにボタンも置く。 */
export function appHandoffHtml(appUrl: string): string {
  const safe = appUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const js = JSON.stringify(appUrl).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>ロカわんに戻る</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FFF7EC;color:#4A3426;font-family:-apple-system,"Hiragino Sans",sans-serif;text-align:center}
.box{padding:32px 24px;max-width:360px}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;line-height:1.7;margin:0 0 24px}
a{display:block;background:#FF8E5E;color:#fff;font-weight:700;text-decoration:none;border-radius:999px;padding:16px}</style></head>
<body><div class="box"><h1>🐾 ログインできました</h1>
<p>ロカわんアプリに戻ります。<br>戻らないときは、下のボタンを押してください。</p>
<a href="${safe}">ロカわんに戻る</a></div>
<script>setTimeout(function(){location.href=${js}},300)</script></body></html>`;
}
