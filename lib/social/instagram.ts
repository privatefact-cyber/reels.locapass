// Instagram(Instagram API with Instagram Login)で、写真つきの投稿を1件作る。
// 仕様: コンテナを作る(/me/media) → 処理完了を待つ → 公開(/me/media_publish)。写真はJPEGで、公開されたURLが必要。
// 認証: アカウントごとの長期トークン(INSTAGRAM_ACCESS_TOKEN_LOCAPASS / INSTAGRAM_ACCESS_TOKEN_LUXELA)。プロアカウントが必要。

const API = "https://graph.instagram.com/v22.0";

export type SocialAccount = "locapass" | "luxela";

export function instagramTokenFor(account: SocialAccount): string | null {
  const v = (account === "luxela" ? process.env.INSTAGRAM_ACCESS_TOKEN_LUXELA : process.env.INSTAGRAM_ACCESS_TOKEN_LOCAPASS)?.trim();
  return v || null;
}

async function call<T>(path: string, method: "GET" | "POST", params: Record<string, string>, token: string): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(method === "GET" ? `${API}${path}?${query}` : `${API}${path}`, {
    method,
    ...(method === "POST" ? { body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!response.ok || body.error) throw new Error(`Instagram API ${response.status}: ${body.error?.message ?? "不明なエラー"}`);
  return body;
}

/** 写真つきの投稿を公開し、投稿のidを返す。キャプションは2200文字まで。 */
export async function publishInstagramImagePost(token: string, input: { caption: string; imageUrl: string }): Promise<string> {
  const container = await call<{ id: string }>("/me/media", "POST", { image_url: input.imageUrl, caption: input.caption }, token);
  for (let i = 0; i < 8; i++) {
    const s = await call<{ status_code?: string }>(`/${container.id}`, "GET", { fields: "status_code" }, token);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram コンテナ処理に失敗: ${s.status_code}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const published = await call<{ id: string }>("/me/media_publish", "POST", { creation_id: container.id }, token);
  return published.id;
}
