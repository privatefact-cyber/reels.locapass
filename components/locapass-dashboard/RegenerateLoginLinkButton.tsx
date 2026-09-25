"use client";

export function RegenerateLoginLinkButton({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "投稿用リンクを再発行します。今までのリンク/QRコードは無効になり、パートナーは新しいリンクが必要になります。よろしいですか？",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-xs text-black/40 hover:text-red-600"
      >
        リンクを再発行する(旧リンクは無効化)
      </button>
    </form>
  );
}
