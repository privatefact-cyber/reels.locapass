"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Printer } from "lucide-react";
import { petButton } from "./ui";

/** 首輪用の迷子QRタグ・名刺のQR。印刷・画像保存・URLコピーができる。 */
export function QrTag({ url, name, avatarUrl }: { url: string; name: string; avatarUrl: string | null }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M", color: { dark: "#4A3426", light: "#FFFFFF" } }).then(setDataUrl);
  }, [url]);

  return (
    <div>
      <div id="pet-qr-print" className="mx-auto w-full max-w-[300px] rounded-[32px] border-4 border-[#FF8E5E] bg-white p-5 text-center shadow-[0_8px_0_#EE6A36]">
        <div className="flex items-center justify-center gap-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="text-2xl" aria-hidden>
              🐶
            </span>
          )}
          <p className="text-xl font-extrabold text-[#4A3426]">{name}</p>
        </div>
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`${name}のQRコード`} className="mx-auto mt-3 w-full" />
        ) : (
          <div className="mx-auto mt-3 aspect-square w-full animate-pulse rounded-2xl bg-[#FFF3E6]" />
        )}
        <p className="mt-2 text-xs font-bold leading-relaxed text-[#7A6050]">
          この子を見つけたら
          <br />
          スマホのカメラで読んでください 🐾
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => window.print()} className={petButton.soft}>
          <Printer size={16} />
          印刷
        </button>
        <a href={dataUrl ?? "#"} download={`${name}-qr.png`} className={petButton.soft}>
          <Download size={16} />
          保存
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={petButton.soft}
        >
          <Copy size={16} />
          {copied ? "コピー済" : "URL"}
        </button>
      </div>
      <style>{`@media print { body * { visibility: hidden !important; } #pet-qr-print, #pet-qr-print * { visibility: visible !important; } #pet-qr-print { position: fixed; left: 0; top: 0; box-shadow: none; } }`}</style>
    </div>
  );
}
