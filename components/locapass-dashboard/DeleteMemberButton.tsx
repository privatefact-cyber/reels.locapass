"use client";

/**
 * キャスト/スタッフの完全削除ボタン。誤操作防止のため確認ダイアログを挟む。
 * 削除するとプロフィール・写真・出勤予定・投稿リール・ログインリンクなど関連データも
 * すべて連鎖削除される(元に戻せない)ので、文言でもそれを明示する。
 */
export function DeleteMemberButton({
  action,
  label,
  targetName,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  targetName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `「${targetName}」を削除します。プロフィール・写真・出勤予定・投稿リールなど関連データもすべて削除され、元に戻せません。よろしいですか？`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
        {label}
      </button>
    </form>
  );
}
