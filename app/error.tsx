"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-semibold">一時的に読み込めませんでした</p>
      <p className="text-sm text-neutral-400">
        通信状況が不安定な可能性があります。もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        再読み込み
      </button>
    </div>
  );
}
