"use client";

export function RestoreMemberButton({
  action,
  label = "復帰させる",
}: {
  action: (formData: FormData) => Promise<void>;
  label?: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
      >
        {label}
      </button>
    </form>
  );
}
