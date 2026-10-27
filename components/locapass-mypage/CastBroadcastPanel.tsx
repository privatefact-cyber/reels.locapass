"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareDmImage } from "@/lib/dm/prepareDmImage";

/**
 * FACES本人が、自分をフォローしているユーザー全員に、一括でメッセージ(画像つき)を送る。
 * 受け取った側には「お知らせ」として届く(返信はできない。1対1のDMは相互フォローのときだけ)。
 * 画像(割引チケットなど)は縮小して、非公開バケットへ直接アップロードしてから送る。
 */
export function CastBroadcastPanel({ castId }: { castId: string }) {
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient()
      .rpc("locapass_count_cast_followers", { p_cast_id: castId })
      .then(({ data }) => setFollowerCount(typeof data === "number" ? data : null));
  }, [castId]);

  async function handlePick(file: File) {
    setError(null);
    try {
      const blob = await prepareDmImage(file);
      if (image) URL.revokeObjectURL(image.previewUrl);
      setImage({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像を読み込めませんでした");
    }
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
  }

  async function handleSend() {
    if (sending) return;
    setError(null);
    setDone(null);
    if (!body.trim() && !image) {
      setError("本文を入力するか、画像を添付してください");
      return;
    }
    if (!window.confirm(`フォロワー${followerCount ?? ""}人に送信します。よろしいですか?`)) return;

    setSending(true);
    try {
      const supabase = createClient();
      let path: string | undefined;
      if (image) {
        const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
        path = `${castId}/${id}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("locapass-shop-messages")
          .upload(path, image.blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("画像のアップロードに失敗しました");
      }
      const { data, error: rpcError } = await supabase.rpc("locapass_send_cast_message", {
        p_body: body.trim(),
        p_image_path: path,
      });
      if (rpcError) throw new Error(rpcError.message);
      setDone(`${data ?? 0}人に送信しました`);
      setBody("");
      clearImage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mx-4 mt-6 rounded-2xl border border-main/10 bg-surface p-4">
      <h2 className="text-sm font-bold text-tone-100">フォロワーへ一括メッセージ</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-tone-500">
        あなたをフォローしている{followerCount === null ? "" : `${followerCount}人`}のユーザーに、お知らせとして届きます。割引チケットなどの画像も添付できます(返信はできません)。
      </p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="今夜は特別な割引チケットをプレゼント！"
        className="mt-3 w-full rounded-lg border border-main/20 bg-main/5 px-3 py-2 text-[16px] text-main placeholder:text-tone-500"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handlePick(f);
        }}
      />
      {image ? (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl} alt="添付する画像" className="max-h-48 rounded-lg border border-main/15" />
          <button
            type="button"
            onClick={clearImage}
            aria-label="画像を外す"
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-panel-950 text-tone-100"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-main/25 px-4 py-2.5 text-sm text-tone-300"
        >
          <ImagePlus size={16} />
          画像を添付
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {done && <p className="mt-2 text-xs text-emerald-400">{done}</p>}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || followerCount === 0}
        className="mt-3 w-full rounded-full bg-gradient-to-r from-cta-light to-cta px-4 py-2.5 text-sm font-semibold text-on-cta disabled:opacity-50"
      >
        {sending ? "送信中..." : "フォロワー全員に送る"}
      </button>
    </section>
  );
}
