"use client";

import { useRef, useState } from "react";
import { ImagePlus, Smile } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareDmImage } from "@/lib/dm/prepareDmImage";
import { DM_STAMPS } from "@/lib/dm/stamps";

export type DmSentMessage = {
  id: string;
  sender_type: string;
  body: string;
  image_path: string | null;
  stamp: string | null;
  created_at: string;
};

const SELECT = "id, sender_type, body, image_path, stamp, created_at";

/**
 * 入力欄の横に置く「スタンプ」「画像」ボタン。スタンプは即送信、画像は縮小してアップロード後に送信する。
 * 画像を送れるのはスタッフ側だけ(canAttachImage)。送れなかった場合は onError を呼ぶ
 * (フォロー解除・ブロックで閉じた場合を含む。画面側で状態を見直す)。
 */
export function DmAttachButtons({
  threadId,
  senderType,
  canAttachImage,
  disabled,
  onSent,
  onError,
}: {
  threadId: string;
  senderType: "user" | "staff";
  canAttachImage: boolean;
  disabled?: boolean;
  onSent: (m: DmSentMessage) => void;
  onError: (message: string) => void;
}) {
  const [stampsOpen, setStampsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sendStamp(stamp: string) {
    setStampsOpen(false);
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("locapass_staff_dm_messages")
      .insert({ thread_id: threadId, sender_type: senderType, body: "", stamp })
      .select(SELECT)
      .single();
    setBusy(false);
    if (error || !data) onError("送信できませんでした");
    else onSent(data);
  }

  async function sendImage(file: File) {
    setBusy(true);
    try {
      const blob = await prepareDmImage(file);
      const supabase = createClient();
      const path = `${threadId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("locapass-dm").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw new Error("画像を送信できませんでした");
      const { data, error } = await supabase
        .from("locapass_staff_dm_messages")
        .insert({ thread_id: threadId, sender_type: senderType, body: "", image_path: path })
        .select(SELECT)
        .single();
      if (error || !data) throw new Error("送信できませんでした");
      onSent(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const btn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-main/20 text-tone-300 disabled:opacity-40";

  return (
    <div className="relative flex shrink-0 gap-1.5">
      {canAttachImage && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void sendImage(f);
            }}
          />
          <button type="button" aria-label="画像を送る" disabled={disabled || busy} onClick={() => fileRef.current?.click()} className={btn}>
            <ImagePlus size={16} />
          </button>
        </>
      )}
      <button type="button" aria-label="スタンプを送る" disabled={disabled || busy} onClick={() => setStampsOpen((v) => !v)} className={btn}>
        <Smile size={16} />
      </button>
      {stampsOpen && (
        <div className="absolute bottom-11 left-0 z-10 grid w-56 grid-cols-6 gap-1 rounded-xl border border-main/15 bg-panel-950 p-2 shadow-lg">
          {DM_STAMPS.map((s) => (
            <button key={s} type="button" onClick={() => sendStamp(s)} className="rounded-lg p-1 text-xl hover:bg-main/10">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
