"use client";

import { useRef, useState } from "react";

export type ScannedIdFields = {
  legal_name: string | null;
  legal_name_kana: string | null;
  birth_date: string | null;
  address: string | null;
};

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CastIdScanModal({ onResult }: { onResult: (fields: ScannedIdFields) => void }) {
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetch("/api/cast/scan-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "読み取りに失敗しました");
      onResult(data.fields);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました");
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        📷 免許証・マイナンバーカードをスキャンして自動入力
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">本人確認書類をスキャン</h3>

            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="mb-3 max-h-48 w-full rounded-lg object-contain" />
            )}

            {scanning && <p className="mb-3 text-sm text-slate-500">読み取り中...</p>}
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={scanning}
                className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-main hover:bg-slate-800 disabled:opacity-50"
              >
                {previewUrl ? "撮り直す" : "写真を選択・撮影"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              画像は読み取り処理のみに使用され、保存されません。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
