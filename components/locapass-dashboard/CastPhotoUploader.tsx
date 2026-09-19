"use client";

import { useRef, useState } from "react";

export function CastPhotoUploader({ castId, shopId }: { castId: string; shopId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 本家はcast-mediaバケット+mediaテーブルに保存する。locapassには写真の受け皿が無いため未接続。
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setError("この機能はまだlocapassのデータベースに接続されていません");
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {uploading ? "アップロード中..." : "画像を追加"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
