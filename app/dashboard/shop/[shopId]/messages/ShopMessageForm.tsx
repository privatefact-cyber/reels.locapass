"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareDmImage } from "@/lib/dm/prepareDmImage";
import { sendShopMessage } from "./actions";

type FavoriteUser = { userId: string; nickname: string };

/**
 * お気に入りユーザーへのメッセージ送信フォーム。画像(店舗が作った割引チケットなど)を1枚添付できる。
 * 画像は縮小してから、非公開バケットへ直接アップロードし(サーバー経由のサイズ上限を避ける)、
 * そのパスだけをサーバーアクションに渡す。
 */
export function ShopMessageForm({ shopId, favoriteUsers }: { shopId: string; favoriteUsers: FavoriteUser[] }) {
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setDone(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    if (!String(formData.get("body") ?? "").trim() && !image) {
      setError("本文を入力するか、画像を添付してください");
      return;
    }

    setSending(true);
    try {
      if (image) {
        const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
        const path = `${shopId}/${id}.jpg`;
        const { error: uploadError } = await createClient()
          .storage.from("locapass-shop-messages")
          .upload(path, image.blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("画像のアップロードに失敗しました");
        formData.set("image_path", path);
      }
      const result = await sendShopMessage(shopId, formData);
      setDone(`${result.sent}人に送信しました`);
      form.reset();
      clearImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700">送信先</label>
        <select
          name="target_user_id"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
        >
          <option value="" className="text-slate-900">お気に入り登録者 全員({favoriteUsers.length}人)</option>
          {favoriteUsers.map((u) => (
            <option key={u.userId} value={u.userId} className="text-slate-900">
              {u.nickname}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700">本文(画像だけでも送れます)</label>
        <textarea
          name="body"
          rows={4}
          maxLength={500}
          placeholder="今週末はイベント開催中です！ぜひ遊びに来てください。"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700">画像(割引チケットなど・1枚)</label>
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
          <div className="relative mt-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.previewUrl} alt="添付する画像" className="max-h-56 rounded-lg border border-slate-200" />
            <button
              type="button"
              onClick={clearImage}
              aria-label="画像を外す"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            <ImagePlus size={18} />
            画像を選ぶ
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}

      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {sending ? "送信中..." : "送信する"}
      </button>
    </form>
  );
}
