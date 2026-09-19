"use client";

import { useRef, useState } from "react";

export function CastIdDocumentUploader({
  castId,
  hasDocument,
}: {
  castId: string;
  hasDocument: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 本家はid-documentsバケットに保存する。locapassには身分証画像の受け皿が無いため未接続。
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setError("この機能はまだlocapassのデータベースに接続されていません");
  }

  async function handleDelete() {
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
      <div className="flex gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "処理中..." : hasDocument ? "画像を差し替え" : "身分証画像を保存"}
        </button>
        {hasDocument && (
          <button
            type="button"
            disabled={uploading}
            onClick={handleDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            削除
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
