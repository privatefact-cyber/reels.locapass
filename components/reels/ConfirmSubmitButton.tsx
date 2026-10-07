"use client";

/** フォームの送信ボタン。押したときに確認ダイアログを出し、キャンセルなら送信しない(取り消せない削除などに使う)。 */
export function ConfirmSubmitButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
