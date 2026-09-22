/**
 * サーバー側(Server Action等、Fileを直接持っているコンテキスト)からCloudflare Streamへ
 * 動画をアップロードする。ブラウザ側のuploadToStream(TUS直送)とは別経路で、
 * 単純な1回のmultipartアップロードを使う(管理画面のような低頻度・小容量の投稿向け)。
 */
export async function uploadFileToStream(file: File): Promise<string> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare Stream is not configured");

  const body = new FormData();
  body.append("file", file, file.name);

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.errors?.[0]?.message ?? "Cloudflare Streamへのアップロードに失敗しました");
  }
  return result.result.uid as string;
}
