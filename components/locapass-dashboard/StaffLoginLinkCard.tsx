import QRCode from "qrcode";
import { CopyButton } from "./CopyButton";
import { RegenerateLoginLinkButton } from "./RegenerateLoginLinkButton";

export async function StaffLoginLinkCard({
  staffName,
  loginUrl,
  regenerateAction,
}: {
  staffName: string;
  loginUrl: string;
  regenerateAction: (formData: FormData) => Promise<void>;
}) {
  const qrDataUrl = await QRCode.toDataURL(loginUrl, { margin: 1, width: 160 });
  const lineShareText = `${staffName}さんのマイページ用リンクです。タップしてログインしてください。\n${loginUrl}`;
  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(lineShareText)}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrDataUrl}
        alt="マイページ用リンクのQRコード"
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 self-start rounded border border-black/10 object-contain"
      />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <input
            readOnly
            value={loginUrl}
            className="w-full rounded border border-black/20 bg-black/5 px-3 py-2 text-xs text-black"
          />
          <CopyButton value={loginUrl} />
        </div>
        <a
          href={lineShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-[#06C755] px-3 py-1.5 text-xs font-semibold text-main hover:opacity-90"
        >
          LINEで送る
        </a>
        <div>
          <RegenerateLoginLinkButton action={regenerateAction} />
        </div>
      </div>
    </div>
  );
}
