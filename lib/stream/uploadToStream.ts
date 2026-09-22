"use client";
import * as tus from "tus-js-client";
export async function uploadToStream(file: File, onProgress?: (percent: number) => void) {
  const created = await fetch("/api/stream/direct-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name }) });
  if (!created.ok) throw new Error((await created.json()).error ?? "Stream upload could not start");
  const { uploadURL, uid } = await created.json() as { uploadURL: string; uid: string };
  await new Promise<void>((resolve, reject) => {
    // Direct Creator Upload URL は「作成済みのuploadUrl」ではなくTUSの作成先(endpoint)。
    // uploadUrl を指定すると最初のPOSTを省略してしまい、Cloudflare 側でアップロードが失敗する。
    const upload = new tus.Upload(file, { endpoint: uploadURL, retryDelays: [0, 1000, 3000, 5000], chunkSize: 5 * 1024 * 1024, metadata: { filename: file.name, filetype: file.type }, onError: (cause) => reject(cause), onProgress: (sent, total) => onProgress?.(Math.round(sent / total * 100)), onSuccess: () => resolve() });
    upload.start();
  });
  return uid;
}
