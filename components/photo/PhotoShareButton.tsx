"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ImageIcon, Link2, MessageCircle, MoreHorizontal, Share2 } from "lucide-react";
import type { PhotoPost } from "@/lib/photo/getPhotoPosts";
import { photoShareUrl } from "@/components/photo/sharePhoto";
import { photoResized } from "@/components/photo/photoUtils";
import { useLocale } from "@/components/i18n/LocaleProvider";

/**
 * 写真1枚のシェアボタン。押すと、LINEで送る / Xで投稿 / リンクをコピー / (端末が対応していれば)その他のアプリ、を選べる。
 * variant "text" は投稿カードの操作行、"pill" は全画面表示の上に重ねる丸いボタン。
 */
export function PhotoShareButton({
  post,
  variant = "text",
}: {
  post: Pick<PhotoPost, "id" | "spotName" | "imageUrl" | "videoUrl">;
  variant?: "text" | "pill";
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [photoCopied, setPhotoCopied] = useState(false);
  const [linkNote, setLinkNote] = useState(false);
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
    if (!linkNote) return;
    const timer = window.setTimeout(() => setLinkNote(false), 6000);
    return () => window.clearTimeout(timer);
  }, [linkNote]);

  useEffect(() => {
    if (!photoCopied) return;
    const timer = window.setTimeout(() => setPhotoCopied(false), 4000);
    return () => window.clearTimeout(timer);
  }, [photoCopied]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const text = t.photo.shareText(post.spotName);
  // 写真ファイルを付けて送れるか(スマホの共有画面)。動画の投稿は対象外(写真ではなく動画の1コマになるため)。
  const [canShareFile, setCanShareFile] = useState(false);
  // スマホ(タッチ操作の端末)で端末の共有画面が使えるなら、メニューを出さず、押した瞬間にそれを開く(写真とリンクを素直に送れる)。
  const [directShare, setDirectShare] = useState(false);
  useEffect(() => {
    setDirectShare(typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches);
    try {
      const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "a.jpg", { type: "image/jpeg" });
      // パソコン(Macなど)の共有画面にはLINEが入っていないことが多いので、「写真つきで送る」はスマホ(タッチ端末)だけにする。
      // パソコンでは「写真をコピー」→ LINEに貼り付け、が確実。
      const touch = window.matchMedia("(pointer: coarse)").matches;
      setCanShareFile(touch && !post.videoUrl && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
  }, [post.videoUrl]);
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-main hover:bg-white/10";

  async function copy() {
    try {
      await navigator.clipboard.writeText(photoShareUrl(post));
      setCopied(true);
    } catch {
      // クリップボードが使えない環境では何もしない。
    }
  }

  /** 写真ファイルを取得する(元の画像形式のまま、幅1600pxに縮小)。 */
  async function fetchPhotoFile(): Promise<File | null> {
    try {
      const src = photoResized(post.imageUrl, 1600, false);
      const res = await fetch(src.includes("/render/image/") ? `${src}&format=origin` : src);
      if (!res.ok) return null;
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      return new File([blob], `${post.spotName.replace(/[\\/:*?"<>|]/g, "_")}.${ext}`, { type: blob.type || "image/jpeg" });
    } catch {
      return null;
    }
  }

  async function sendWithPhoto() {
    // 写真を付けると、LINEなど多くのアプリは本文(リンク)を無視する。リンクはコピーしておき、必要なら貼り付けて送れるようにする。
    // (クリックの直後に書き込むため、写真の取得より先に行う)
    try {
      await navigator.clipboard.writeText(photoShareUrl(post));
      setLinkNote(true);
    } catch {
      // コピーできない環境では何もしない。
    }
    const file = await fetchPhotoFile();
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        // 写真と一緒にURLが落ちる端末があるので、URLは本文にも入れる。
        await navigator.share({ files: [file], title: `LOCAPASS | ${post.spotName}`, text: `${text}\n${photoShareUrl(post)}` });
      } else {
        await navigator.share({ title: `LOCAPASS | ${post.spotName}`, text, url: photoShareUrl(post) });
      }
    } catch {
      // キャンセル等は何もしない。
    }
    setOpen(false);
  }

  /** 写真そのものをクリップボードへ。LINEなどのトーク画面に貼り付ければ、写真として送れる(クリップボードはPNGだけ受け付ける)。 */
  async function copyPhotoImage() {
    try {
      // ClipboardItemにPromiseを渡す: クリックの直後にwriteを呼べるので、Safariでも(取得に時間がかかっても)許可される。
      const png = (async () => {
        const file = await fetchPhotoFile();
        if (!file) throw new Error("no photo");
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("no png");
        return blob;
      })();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setPhotoCopied(true);
    } catch {
      // コピーできない環境では、下の「写真を保存」を使ってもらう。
    }
  }

  async function savePhoto() {
    const file = await fetchPhotoFile();
    if (file) {
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10000);
    }
    setOpen(false);
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
      <button
        type="button"
        onClick={() => {
          if (directShare) void (canShareFile ? sendWithPhoto() : more());
          else setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={t.common.share}
        className={trigger}
      >
        <Share2 size={variant === "pill" ? 18 : 16} />
        {t.common.share}
      </button>
      {linkNote && !open ? (
        <div role="status" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-white/15 bg-tone-900 px-3 py-2 text-xs text-main shadow-xl">
          {t.photo.linkAlsoCopied}
        </div>
      ) : null}
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[85vw] rounded-xl border border-white/15 bg-tone-900 p-1 shadow-xl">
          {canShareFile ? (
            <button type="button" role="menuitem" className={item} onClick={() => void sendWithPhoto()}>
              <ImageIcon size={16} />
              {t.photo.shareWithPhoto}
            </button>
          ) : !post.videoUrl ? (
            <>
              <button type="button" role="menuitem" className={item} onClick={() => void copyPhotoImage()}>
                {photoCopied ? <Check size={16} /> : <Copy size={16} />}
                {photoCopied ? t.photo.copyPhotoDone : t.photo.copyPhoto}
              </button>
              <button type="button" role="menuitem" className={item} onClick={() => void savePhoto()}>
                <Download size={16} />
                {t.photo.savePhoto}
              </button>
            </>
          ) : null}
          <a
            role="menuitem"
            className={item}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(photoShareUrl(post))}&text=${encodeURIComponent(text)}`}
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
