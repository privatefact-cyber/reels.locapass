"use client";

import { createClient } from "@/lib/supabase/client";
import { requestPetUpload, type UploadKind } from "@/app/pet/actions";

/** 写真を長辺 maxEdge px のJPEGに縮める(読めない形式はそのまま) */
export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** 写真を非公開の置き場へ送り、保存用のパスを返す */
export async function uploadPetImage(kind: UploadKind, targetId: string, file: File): Promise<string> {
  const blob = await downscaleImage(file);
  const prepared = await requestPetUpload(kind, targetId);
  if (!prepared.ok) throw new Error(prepared.error);
  const { error } = await createClient()
    .storage.from("pet-private")
    .uploadToSignedUrl(prepared.path, prepared.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("写真を送れませんでした。電波の良い場所でもう一度お試しください");
  return prepared.path;
}

/** AI読み取り用に、写真をBase64(JPEG)にする */
export async function imageToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const blob = await downscaleImage(file, 1600, 0.85);
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), mimeType: blob.type || "image/jpeg" };
}
