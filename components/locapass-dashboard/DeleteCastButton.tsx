"use client";

/**
 * FACESの削除(退店)ボタン。削除するときに、そのFACESのリールをどうするか店が選ぶ。
 * リールは店舗の資産なので、プラットフォームは使う/使わないを判断しない。
 *  - 書庫に残す(既定): 非表示のストックとして店に残る。再表示も削除も店が自由にできる。
 *  - リールも削除する: 元に戻せない。
 * 誤操作防止のため、送信時に確認ダイアログを挟む。
 */
export function DeleteCastButton({
  action,
  targetName,
}: {
  action: (formData: FormData) => Promise<void>;
  targetName: string;
}) {
  return (
    <details className="relative text-right">
      <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-red-600">FACESを削除</summary>
      <form
        action={action}
        onSubmit={(e) => {
          const choice = new FormData(e.currentTarget).get("reels");
          const message =
            choice === "delete"
              ? `「${targetName}」を削除し、投稿したリールもすべて削除します。リールは元に戻せません。よろしいですか？`
              : `「${targetName}」を削除します。投稿したリールは非表示にして、店の書庫に残します。よろしいですか？\n(FACESは30日以内なら復帰できます)`;
          if (!window.confirm(message)) e.preventDefault();
        }}
        className="absolute right-0 z-10 mt-1 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-lg"
      >
        <p className="text-xs font-semibold text-slate-900">「{targetName}」のリールをどうしますか？</p>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
          <input type="radio" name="reels" value="archive" defaultChecked className="mt-0.5" />
          <span>
            <span className="font-semibold">書庫に残す</span>(おすすめ)
            <br />
            非表示になり、店の書庫に保管されます。あとから再表示も削除もできます。
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
          <input type="radio" name="reels" value="delete" className="mt-0.5" />
          <span>
            <span className="font-semibold text-red-600">リールも削除する</span>
            <br />
            元に戻せません。
          </span>
        </label>
        <button type="submit" className="w-full rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          FACESを削除する
        </button>
      </form>
    </details>
  );
}
