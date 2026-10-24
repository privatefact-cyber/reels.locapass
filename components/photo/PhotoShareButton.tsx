"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, MessageCircle, MoreHorizontal, Share2 } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { photoShareUrl } from "@/components/photo/sharePhoto";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 写真1枚のシェアボタン。押すと、LINEで送る / Xで投稿 / リンクをコピー / (端末が対応していれば)その他のアプリ、を選べる。
 * variant "text" は投稿カードの操作行、"pill" は全画面表示の上に重ねる丸いボタン。
 */
export function PhotoShareButton({
  post,
  variant = "text",
}: {
  post: Pick<PhotoPost, "id" | "spotName">;
  variant?: "text" | "pill";
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const text = t.photo.shareText(post.spotName);
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-main hover:bg-white/10";

  async function copy() {
    try {
      await navigator.clipboard.writeText(photoShareUrl(post));
      setCopied(true);
    } catch {
      // クリップボードが使えない環境では何もしない。
    }
  }

  async function more() {
    try {
      await navigator.share({ title: `LOCAPASS | ${post.spotName}`, text, url: photoShareUrl(post) });
    } catch {
      // キャンセル等は何もしない。
    }
    setOpen(false);
  }

  const trigger =
    variant === "pill"
      ? "flex h-11 items-center gap-1.5 rounded-full bg-black/50 px-4 text-sm text-white backdrop-blur"
      : "flex items-center gap-1 hover:text-main";

  return (
    <span ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t.common.share} className={trigger}>
        <Share2 size={variant === "pill" ? 18 : 16} />
        {t.common.share}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-white/15 bg-tone-900 p-1 shadow-xl">
          <a
            role="menuitem"
            className={item}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(photoShareUrl(post))}`}
            onClick={() => setOpen(false)}
          >
            <MessageCircle size={16} />
            {t.photo.shareLine}
          </a>
          <a
            role="menuitem"
            className={item}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(photoShareUrl(post))}`}
            onClick={() => setOpen(false)}
          >
            <span className="flex h-4 w-4 items-center justify-center text-[13px] font-bold">𝕏</span>
            {t.photo.shareX}
          </a>
          <button type="button" role="menuitem" className={item} onClick={() => void copy()}>
            {copied ? <Check size={16} /> : <Link2 size={16} />}
            {copied ? t.common.linkCopied : t.photo.shareCopy}
          </button>
          {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
            <button type="button" role="menuitem" className={item} onClick={() => void more()}>
              <MoreHorizontal size={16} />
              {t.photo.shareMore}
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
