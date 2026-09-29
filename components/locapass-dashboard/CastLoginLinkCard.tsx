import QRCode from "qrcode";
import { CopyButton } from "./CopyButton";
import { RegenerateLoginLinkButton } from "./RegenerateLoginLinkButton";
import { LoginPinPanel } from "./LoginPinPanel";

export async function CastLoginLinkCard({
  castName,
  loginUrl,
  regenerateAction,
  hasPin,
  issuePin,
}: {
  castName: string;
  loginUrl: string;
  regenerateAction: (formData: FormData) => Promise<void>;
  hasPin: boolean;
  issuePin: () => Promise<{ pin?: string; error?: string }>;
}) {
  const qrDataUrl = await QRCode.toDataURL(loginUrl, { margin: 1, width: 220 });
  const lineShareText = `${castName}さんの投稿用リンクです。タップして、別途お伝えする暗証番号でログインしてください。\n${loginUrl}`;
  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(lineShareText)}`;

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <h2 className="mb-2 text-sm font-bold">投稿用リンク(マイページ)</h2>
      <p className="mb-3 text-xs text-black/50">
        このリンクを開き、6桁の暗証番号を入力するとFACES本人が投稿用マイページにログインできます。URLだけでは入れません。暗証番号はリンクとは別の方法で伝えてください(LINE送信には含まれません)。
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shrink-0 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="投稿用リンクのQRコード"
            width={128}
            height={128}
            className="h-32 w-32 rounded border border-black/10 object-contain"
          />
          {/* サイト全体のimgガードで右クリック保存できないため、ダウンロードリンクで保存できるようにする */}
          <a
            href={qrDataUrl}
            download="login-qr.png"
            className="mt-1 inline-block text-xs font-semibold text-brand underline"
          >
            画像として保存
          </a>
        </div>
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
            className="inline-block rounded bg-[#06C755] px-4 py-2 text-xs font-semibold text-main hover:opacity-90"
          >
            LINEで送る
          </a>
          <LoginPinPanel hasPin={hasPin} issue={issuePin} />
          <div>
            <RegenerateLoginLinkButton action={regenerateAction} />
          </div>
        </div>
      </div>
    </section>
  );
}
