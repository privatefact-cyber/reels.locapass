"use client";

import { useState } from "react";
import { QrCode, X, Copy, Check } from "lucide-react";

/**
 * QRコードをアイコンボタンにして、タップ時だけモーダルで見せる。
 * 常時テキストリンクやQR画像を画面に出しっぱなしにしないための省スペース版。
 * profileUrlを渡すと、モーダル内にURL表示+コピー機能もまとめて出す
 * (画面に常時露出する「公開プロフィールURL」欄を別途置かなくて済むようにするため)。
 */
export function QrCodeIconButton({
  qrDataUrl,
  profileUrl,
  label = "QRコードを表示",
  iconClassName,
  theme = "dark",
}: {
  qrDataUrl: string;
  profileUrl?: string;
  label?: string;
  iconClassName?: string;
  /** "light": 管理画面(白背景)向けの配色。既定は公開ページ・キャストマイページ向けのダーク配色。 */
  theme?: "dark" | "light";
}) {
  const resolvedIconClassName =
    iconClassName ??
    (theme === "light"
      ? "flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
      : "flex h-9 w-9 items-center justify-center rounded-full border border-main/15 text-tone-300 transition hover:border-hl-400/50 hover:text-hl-300");
  const [open, setOpen] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopyUrl() {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では無視する(URLはモーダル内に表示済みなので手動コピー可能)。
    }
  }

  // iOS Safariはdata: URLへのdownload属性を無視して画像をそのまま開いてしまうため、
  // まずWeb Share API(ファイル共有)を試し、それも使えない環境では
  // 「長押しで保存」を案内する(imgタグ自体は長押し保存できる)。
  async function handleSaveImage() {
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      const file = new File([blob], "qr-code.png", { type: blob.type || "image/png" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      // 共有がキャンセル/失敗した場合は下のダウンロード試行にフォールバックする
    }

    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = "qr-code.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setSaveHint("保存できない場合は、QR画像を長押しして保存してください");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className={resolvedIconClassName}>
        <QrCode size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={
              theme === "light"
                ? "w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 text-center"
                : "w-full max-w-xs rounded-2xl border border-line/20 bg-panel-950 p-5 text-center"
            }
          >
            <div className="flex items-center justify-between">
              <p className={theme === "light" ? "text-sm font-bold text-slate-900" : "text-sm font-bold text-tone-100"}>
                {label}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className={
                  theme === "light"
                    ? "rounded-full p-1 text-slate-400 transition hover:text-slate-700"
                    : "rounded-full p-1 text-muted transition hover:text-tone-200"
                }
              >
                <X size={18} />
              </button>
            </div>
            {/* サイト全体のimgガード(右クリック保存不可)をQRだけ回避するため、保存はダウンロードリンクで提供する。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QRコード"
              width={200}
              height={200}
              className="mx-auto mt-4 h-48 w-48 rounded border border-black/10 bg-white p-2"
            />
            <button
              type="button"
              onClick={handleSaveImage}
              className={
                theme === "light"
                  ? "mt-3 inline-block text-xs font-semibold text-blue-600 underline"
                  : "mt-3 inline-block text-xs font-semibold text-brand underline"
              }
            >
              画像として保存
            </button>
            {saveHint && (
              <p className={theme === "light" ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-tone-500"}>
                {saveHint}
              </p>
            )}

            {profileUrl && (
              <div className="mt-4 border-t border-current/10 pt-3 text-left">
                <p className={theme === "light" ? "text-[11px] font-semibold text-slate-500" : "text-[11px] font-semibold text-tone-500"}>
                  公開プロフィールURL(インスタ等に貼る用)
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    readOnly
                    value={profileUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className={
                      theme === "light"
                        ? "w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-900"
                        : "w-full rounded border border-main/20 bg-main/5 px-2 py-1.5 text-xs text-main"
                    }
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    aria-label="URLをコピー"
                    className={
                      theme === "light"
                        ? "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-500"
                        : "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-main/20 text-tone-300"
                    }
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
