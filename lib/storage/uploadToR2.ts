"use client";

type UploadContext =
  | { context?: "cast_self" }
  | { context: "staff_self" }
  | { context: "shop_on_behalf_of_cast"; castId: string }
  | { context: "shop_self"; shopId: string }
  | { context: "photo_user" };

/** 任意のファイル(Blob/File)をCloudflare R2へ直接PUTし、公開URL(media.locapass.net経由)を返す。 */
async function uploadToR2(
  params: { data: Blob; ext: string; contentType: string } & UploadContext,
): Promise<string> {
  const { data, ext, contentType, ...context } = params;
  const created = await fetch("/api/r2/presigned-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext, contentType, ...context }),
  });
  if (!created.ok) {
    const body = await created.json().catch(() => ({}));
    throw new Error(body.error ?? "アップロードURLの発行に失敗しました");
  }
  const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };

  const putResponse = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: data,
  });
  if (!putResponse.ok) {
    throw new Error(`アップロードに失敗しました(status: ${putResponse.status})`);
  }

  return publicUrl;
}

/**
 * エリアフォト用: 動画をR2へ直接送る(進捗つき)。fetchは送信の進捗が取れないのでXMLHttpRequestを使う。
 * 署名にサイズを含めるため、presigned発行時に実際のファイルサイズを渡す。
 */
export async function uploadPhotoVideoToR2(
  file: File,
  onProgress?: (info: { ratio: number; loaded: number; total: number }) => void,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const contentType = file.type || "video/mp4";
  const created = await fetch("/api/r2/presigned-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext, contentType, context: "photo_user", size: file.size }),
  });
  if (!created.ok) {
    const body = await created.json().catch(() => ({}));
    throw new Error(body.error ?? "アップロードURLの発行に失敗しました");
  }
  const { uploadURL, publicUrl } = (await created.json()) as { uploadURL: string; publicUrl: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ ratio: e.loaded / e.total, loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`アップロードに失敗しました(status: ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("通信に失敗しました"));
    xhr.send(file);
  });
  return publicUrl;
}

export async function uploadVideoToR2(file: File, context: UploadContext = {}): Promise<string> {
  const ext = file.name.split(".").pop() || "mp4";
  return uploadToR2({ data: file, ext, contentType: file.type || "video/mp4", ...context });
}

export async function uploadPosterToR2(blob: Blob, context: UploadContext = {}): Promise<string> {
  return uploadToR2({ data: blob, ext: "jpg", contentType: "image/jpeg", ...context });
}
