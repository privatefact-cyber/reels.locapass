"use client";

import { useState } from "react";
import { Smile } from "lucide-react";

const EMOJIS = [
  "😀", "😂", "🥹", "😊", "😍", "🥰", "😘", "😉",
  "😎", "🤔", "😅", "😭", "🥺", "😢", "😡", "🙏",
  "👍", "👏", "🙌", "💪", "🎉", "✨", "🔥", "💖",
  "❤️", "💕", "💯", "🍻", "🍷", "☕", "🍰", "🎫",
];

/** 入力欄に絵文字を差し込むピッカー(普通のチャットと同じ。送信は通常どおり送信ボタン/Enter)。 */
export function DmEmojiButton({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label="絵文字"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-main/20 text-tone-300 disabled:opacity-40"
      >
        <Smile size={16} />
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-10 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-main/15 bg-panel-950 p-2 shadow-lg">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="rounded-md p-1 text-xl hover:bg-main/10"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
