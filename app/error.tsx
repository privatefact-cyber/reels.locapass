"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-semibold">{t.error.title}</p>
      <p className="text-sm text-neutral-400">{t.error.body}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        {t.error.retry}
      </button>
    </div>
  );
}
