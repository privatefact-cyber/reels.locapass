"use client";

import { useRef, useState } from "react";

const STATUS_LABEL: Record<string, string> = {
  available: "空席あり",
  few_seats: "残りわずか",
  full: "満席",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * フロア写真をドロップ/選択した瞬間にAI混雑判定APIへ送信する。
 * 画像はブラウザからサーバーへ一往復するだけで、どこにも保存されない。
 */
export function FloorStatusDropzone({ shopId, initialStatusText }: { shopId: string; initialStatusText?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setToast(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/admin/locapass-shop-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, imageBase64: base64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "判定に失敗しました");

      const capturedAt = new Date(data.occupancyStatus.captured_at);
      const timeText = capturedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      const label = STATUS_LABEL[data.occupancyStatus.status] ?? data.occupancyStatus.status;
      setToast({ ok: true, message: `更新しました: ${label}(撮影 ${timeText})` });
    } catch (err) {
      setToast({ ok: false, message: err instanceof Error ? err.message : "判定に失敗しました" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-black/50">フロア写真をアップロード</label>
      <p className="mt-0.5 text-[11px] text-black/40">
        写真は保存されず、AIが混雑状況を判定してすぐに破棄します。
      </p>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`mt-1 flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed text-center text-xs transition ${
          dragOver ? "border-brand bg-brand/5" : "border-black/20 bg-white"
        }`}
      >
        <span className="px-2 text-black/40">
          {uploading ? "判定中..." : "写真をドラッグ&ドロップ、またはタップして選択"}
        </span>
      </div>
      {/*
        captureを付けるとカメラ起動固定になりギャラリーが選べなくなる端末があるため、
        あえて付けない。accept="image/*"のみにすることでiOS/AndroidともOS標準の
        「写真を撮る/ライブラリから選択」の選択メニューが出る。
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {toast && (
        <p className={`mt-2 text-xs ${toast.ok ? "text-green-600" : "text-red-600"}`}>{toast.message}</p>
      )}
      {!toast && initialStatusText && <p className="mt-2 text-xs text-black/40">現在: {initialStatusText}</p>}
    </div>
  );
}
