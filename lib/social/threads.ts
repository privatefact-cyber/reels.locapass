// Threads(Meta)の公式APIで、画像つきの投稿を1件作る。
// 仕様: https://developers.facebook.com/docs/threads/posts (コンテナを作る → threads_publish で公開)。
// 認証: 長期アクセストークン(約60日で期限切れ。期限前に更新が必要)と、Threadsのユーザーid。

const API = "https://graph.threads.net/v1.0";

export type ThreadsConfig = { userId: string; accessToken: string };

export function threadsConfigFromEnv(): ThreadsConfig | null {
  const userId = process.env.THREADS_USER_ID?.trim();
  const accessToken = process.env.THREADS_ACCESS_TOKEN?.trim();
  return userId && accessToken ? { userId, accessToken } : null;
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

/** 画像つきの投稿を公開し、投稿のidを返す。テキストは500文字まで(超えたら呼び出し側で切る)。 */
export async function publishThreadsImagePost(config: ThreadsConfig, input: { text: string; imageUrl: string }): Promise<string> {
  const container = await call<{ id: string }>(`/${config.userId}/threads`, {
    method: "POST",
    params: { media_type: "IMAGE", image_url: input.imageUrl, text: input.text },
  }, config.accessToken);

  // コンテナの処理が終わるまで少し待つ(画像は通常すぐ終わる)。
  for (let i = 0; i < 6; i++) {
    const status = await call<{ status?: string; error_message?: string }>(`/${container.id}`, { method: "GET", params: { fields: "status,error_message" } }, config.accessToken);
    if (status.status === "FINISHED") break;
    if (status.status === "ERROR" || status.status === "EXPIRED") throw new Error(`Threads コンテナ処理に失敗: ${status.error_message ?? status.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const published = await call<{ id: string }>(`/${config.userId}/threads_publish`, {
    method: "POST",
    params: { creation_id: container.id },
  }, config.accessToken);
  return published.id;
}
