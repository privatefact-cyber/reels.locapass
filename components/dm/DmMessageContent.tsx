"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** DMの吹き出しの中身。本文と画像(非公開バケットの署名URL)を出し分ける。 */
export function DmMessageContent({ body, imagePath }: { body: string; imagePath: string | null }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) return;
    let cancelled = false;
    createClient()
      .storage.from("locapass-dm")
      .createSignedUrl(imagePath, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setImageUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  return (
    <>
      {imagePath &&
        (imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="送信された画像" className="mb-1 max-h-64 w-full rounded-lg object-contain" />
          </a>
        ) : (
          <div className="mb-1 h-24 w-40 animate-pulse rounded-lg bg-main/10" />
        ))}
      {body.trim() && <span className="whitespace-pre-wrap">{body}</span>}
    </>
  );
}
