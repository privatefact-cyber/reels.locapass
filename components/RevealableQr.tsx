"use client";

import { useState } from "react";

/** 普段は隠しておき、クリックしたときだけQRコードを表示する(店頭で客に見せる用)。 */
export function RevealableQr({
  qrDataUrl,
  label = "QRコードを表示",
  buttonClassName = "text-xs font-semibold text-brand underline",
}: {
  qrDataUrl: string;
  label?: string;
  buttonClassName?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setVisible((v) => !v)} className={buttonClassName}>
        {visible ? "QRコードを隠す" : label}
      </button>
      {visible && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl}
          alt="QRコード"
          width={160}
          height={160}
          className="mt-2 h-40 w-40 rounded border border-black/10 bg-white p-2"
        />
      )}
    </div>
  );
}
