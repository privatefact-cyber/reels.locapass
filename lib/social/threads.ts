// Threads(Meta)の公式APIで、投稿を1件作る(文章のみ / 画像つき)。
// 仕様: https://developers.facebook.com/docs/threads/posts (コンテナを作る → threads_publish で公開)。
// 認証: 長期アクセストークン(約60日で期限切れ。期限前に更新が必要)。ユーザーidは未設定ならトークンから取得する。

const API = "https://graph.threads.net/v1.0";

/** userId は任意。未設定なら、トークンの持ち主のidを Threads に問い合わせて使う(設定するのはトークンだけで足りる)。 */
export type ThreadsConfig = { userId: string | null; accessToken: string };

export function threadsConfigFromEnv(): ThreadsConfig | null {
  const accessToken = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  return { userId: process.env.THREADS_USER_ID?.trim() || null, accessToken };
}

async function call<T>(path: string, init: { method: "GET" | "POST"; params: Record<string, string> }, accessToken: string): Promise<T> {
  const params = new URLSearchParams({ ...init.params, access_token: accessToken });
  const url = init.method === "GET" ? `${API}${path}?${params}` : `${API}${path}`;
  const response = await fetch(url, {
    method: init.method,
    ...(init.method === "POST" ? { body: params, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!response.ok || body.error) throw new Error(`Threads API ${response.status}: ${body.error?.message ?? "不明なエラー"}`);
  return body;
}

/** コンテナを作り、処理が終わるのを待って公開する。公開した投稿のidを返す。 */
async function createAndPublish(config: ThreadsConfig, params: Record<string, string>): Promise<string> {
  const userId = config.userId ?? (await call<{ id: string }>("/me", { method: "GET", params: { fields: "id" } }, config.accessToken)).id;
  const container = await call<{ id: string }>(`/${userId}/threads`, { method: "POST", params }, config.accessToken);

  // コンテナの処理が終わるまで少し待つ(文章・画像は通常すぐ終わる)。
  for (let i = 0; i < 6; i++) {
    const status = await call<{ status?: string; error_message?: string }>(`/${container.id}`, { method: "GET", params: { fields: "status,error_message" } }, config.accessToken);
    if (status.status === "FINISHED") break;
    if (status.status === "ERROR" || status.status === "EXPIRED") throw new Error(`Threads コンテナ処理に失敗: ${status.error_message ?? status.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const published = await call<{ id: string }>(`/${userId}/threads_publish`, { method: "POST", params: { creation_id: container.id } }, config.accessToken);
  return published.id;
}

/** 文章だけの投稿を公開する。テキストは500文字まで(超えたら呼び出し側で防ぐ)。 */
export async function publishThreadsTextPost(config: ThreadsConfig, input: { text: string }): Promise<string> {
  return createAndPublish(config, { media_type: "TEXT", text: input.text });
}

/** 画像つきの投稿を公開する。 */
export async function publishThreadsImagePost(config: ThreadsConfig, input: { text: string; imageUrl: string }): Promise<string> {
  return createAndPublish(config, { media_type: "IMAGE", image_url: input.imageUrl, text: input.text });
}
