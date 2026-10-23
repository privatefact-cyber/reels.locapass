import QRCode from "qrcode";
import { CopyLoginUrlButton } from "./CopyLoginUrlButton";

/**
 * スマホからすぐ入るための、店長・管理者専用のログインURL。一般向けのページにはリンクを出さない(URLを知っている人だけ入れる)ので、
 * ブックマーク/ホーム画面に追加してもらえるよう、URLのコピー・QR・追加手順を出す。
 */
export async function LoginUrlCard({ url }: { url: string }) {
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">スマホのログイン用URL</h2>
      <p className="mb-3 text-xs text-slate-500">
        店長・管理者専用の入口です(一般のページにはリンクがありません)。スマホで開いて、ブックマークかホーム画面に追加しておくと、いつでもすぐ入れます。
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="ログイン用QRコード" width={132} height={132} className="h-[132px] w-[132px] shrink-0 rounded border border-slate-200" />
        <div className="min-w-0 space-y-2">
          <p className="break-all rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{url}</p>
          <CopyLoginUrlButton url={url} />
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
            <li>iPhone: Safariで開いて、共有ボタン →「ホーム画面に追加」</li>
            <li>Android: Chromeで開いて、メニュー →「ホーム画面に追加」</li>
            <li>ログインしたあとは、ログイン状態が続くので、毎回打つ必要はありません</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
