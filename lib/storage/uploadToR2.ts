"use client";

/** 任意のファイル(Blob/File)をCloudflare R2へ直接PUTし、公開URL(media.luxela.jp経由)を返す。 */
async function uploadToR2(params: { data: Blob; ext: string; contentType: string }): Promise<string> {
  const { data, ext, contentType } = params;
  const created = await fetch("/api/r2/presigned-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ext, contentType }),
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

export async function uploadVideoToR2(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "mp4";
  return uploadToR2({ data: file, ext, contentType: file.type || "video/mp4" });
}

export async function uploadPosterToR2(blob: Blob): Promise<string> {
  return uploadToR2({ data: blob, ext: "jpg", contentType: "image/jpeg" });
}
