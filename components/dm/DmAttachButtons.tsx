"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareDmImage } from "@/lib/dm/prepareDmImage";

export type DmSentMessage = {
  id: string;
  sender_type: string;
  body: string;
  image_path: string | null;
  created_at: string;
};

const SELECT = "id, sender_type, body, image_path, created_at";

/**
 * 入力欄の横に置く「画像を送る」ボタン(ユーザー・スタッフ・FACESの全員が使える)。
 * 画像は縮小して非公開バケットにアップロードしてから、画像つきメッセージとして送る。
 * 送れなかった場合は onError を呼ぶ(フォロー解除・ブロックで閉じた場合を含む。画面側で状態を見直す)。
 */
export function DmAttachButtons({
  threadId,
  senderType,
  disabled,
  onSent,
  onError,
}: {
  threadId: string;
  senderType: "user" | "staff";
  disabled?: boolean;
  onSent: (m: DmSentMessage) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function sendImage(file: File) {
    setBusy(true);
    try {
      const blob = await prepareDmImage(file);
      const supabase = createClient();
      const path = `${threadId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("locapass-dm").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw new Error("画像を送信できませんでした。相互フォローが解除された可能性があります。");
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

  return (
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
      <button
        type="button"
        aria-label="画像を送る"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-main/20 text-tone-300 disabled:opacity-40"
      >
        <ImagePlus size={16} />
      </button>
    </>
  );
}
