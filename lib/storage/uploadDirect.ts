"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Next.jsを経由せず、短命な署名URLへブラウザから直接PUTする。 */
export async function uploadToSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
) {
  const { data, error: signError } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (signError || !data) return { error: signError ?? new Error("署名URLを作成できませんでした") };
  return supabase.storage.from(bucket).uploadToSignedUrl(path, data.token, file, {
    contentType: file.type,
  });
}
