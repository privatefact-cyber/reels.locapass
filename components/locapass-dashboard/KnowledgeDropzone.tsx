"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadKnowledgeFile } from "@/app/dashboard/shop/[shopId]/ai-knowledge/actions";

const MAX_LONG_EDGE = 1500; // 長辺1500px以下。AIの読み取り費用と読み込み速度を抑えつつ、メニューの文字が読める大きさ

/** 写真は、長辺1500px以下のJPEG(品質0.8)に縮めてから送る(スマホの写真は数MBあり、そのままだとVercelの上限4.5MBを超えるため)。 */
async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("画像を処理できませんでした");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
}

/** ファイルをポンと置く欄。PDF・Word・テキスト・写真に対応。置くとAIが読み取り、確認待ちの一覧に出る。 */
export function KnowledgeDropzone({ shopId }: { shopId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ name: string; ok: boolean; text: string }[]>([]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 5);
    if (list.length === 0) return;
    setMessages([]);
    for (const f of list) {
      setBusy(f.name);
      try {
        const file = f.type.startsWith("image/") ? await shrinkImage(f) : f;
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadKnowledgeFile(shopId, null, fd);
        setMessages((m) => [...m, { name: f.name, ok: !!r?.ok, text: r?.ok ? "読み取りました。下の「確認待ち」で内容を見てください" : (r?.message ?? "読み取れませんでした") }]);
      } catch (e) {
        setMessages((m) => [...m, { name: f.name, ok: false, text: e instanceof Error ? e.message : "読み取れませんでした" }]);
      }
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${over ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white hover:border-slate-400"}`}
      >
        <p className="text-4xl">📄</p>
        <p className="text-base font-bold text-slate-900">メニュー表・イベント案内・ルールなどを、ここに置くだけ</p>
        <p className="text-xs text-slate-500">PDF・Word・テキスト・写真(紙のメニューをスマホで撮った写真でもOK)/ 1回に5つまで・1つ4MBまで</p>
        <p className="text-xs text-slate-500">タップして選ぶこともできます</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.currentTarget.files) void handleFiles(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {busy && <p className="text-sm text-slate-600">「{busy}」をAIが読み取っています…(10秒ほどかかります)</p>}
      {messages.map((m, i) => (
        <p key={i} className={`text-sm ${m.ok ? "text-emerald-700" : "text-red-600"}`}>
          {m.name}: {m.text}
        </p>
      ))}
    </div>
  );
}
