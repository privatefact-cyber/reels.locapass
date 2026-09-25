import { verifyPasscode } from "./actions";

export const dynamic = "force-dynamic";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = next && next.startsWith("/") && !next.startsWith("/gate") ? next : "/";

  return (
    <div className="flex min-h-screen select-none flex-col items-center justify-center px-4 text-center text-main">
      <h1 className="mb-3 text-4xl font-extrabold tracking-widest md:text-5xl">LOCAPASS</h1>
      <p className="mb-8 text-xs tracking-widest text-panel-500 md:text-sm">
        NEXT-GEN NIGHT ENTERTAINMENT
      </p>
      <div className="mb-12 inline-block rounded-full border border-panel-800 bg-panel-950 px-4 py-1.5 text-[11px] tracking-wider text-panel-400">
        INVITATION ONLY / 完全招待制
      </div>

      <form action={verifyPasscode} className="flex flex-col items-center gap-2">
        <input type="hidden" name="next" value={nextPath} />
        <input
          type="password"
          name="passcode"
          placeholder="PASSCODE"
          autoFocus
          className="w-32 rounded border border-panel-800 bg-panel-900 px-3 py-2 text-center text-xs tracking-widest text-main placeholder:text-panel-600 focus:border-panel-500 focus:outline-none"
        />
        <button
          type="submit"
          className="mt-1 rounded-full border border-panel-700 px-4 py-1 text-[10px] tracking-widest text-panel-400 transition hover:border-accent hover:text-accent"
        >
          ENTER
        </button>
        {error === "1" && <span className="text-[10px] text-red-500">PASSCODE ERROR</span>}
      </form>
    </div>
  );
}
