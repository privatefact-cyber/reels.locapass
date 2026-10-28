// Googleビジネスプロフィール(Business Information API)への書き込み。
// 運営のGoogleアカウント1つのリフレッシュトークンで、そのアカウントが管理者の全店舗を更新する(代行運用)。
// 環境変数が揃っていなければ「未接続」とみなし、呼び出し側は送信せず内容の確認(dry run)だけを行う。
//   GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN
// ※ Business Profile APIは利用申請の承認が必要。承認前は上記を設定しないこと。

export function gbpConfigured(): boolean {
  return !!(process.env.GBP_CLIENT_ID && process.env.GBP_CLIENT_SECRET && process.env.GBP_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GBP_CLIENT_ID!,
      client_secret: process.env.GBP_CLIENT_SECRET!,
      refresh_token: process.env.GBP_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Googleの認証に失敗しました: ${json.error_description ?? res.status}`);
  return json.access_token;
}

/** locations/{id} を部分更新する。失敗したらGoogleのエラー文言つきで例外を投げる */
export async function patchLocation(locationId: string, location: Record<string, unknown>, updateMask: string): Promise<void> {
  const name = locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;
  const token = await accessToken();
  const res = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${name}?updateMask=${encodeURIComponent(updateMask)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(location),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Googleへの送信に失敗しました(${res.status}): ${body.error?.message ?? "不明なエラー"}`);
  }
}
