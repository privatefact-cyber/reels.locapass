import Link from "next/link";
import { ReelsTab } from "./ReelsTab";
import { EventsTab } from "./EventsTab";
import { ArchiveTab } from "./ArchiveTab";

const TABS = [
  { key: "reel", label: "リール" },
  { key: "event", label: "イベント" },
  { key: "archive", label: "書庫" },
] as const;

/** 投稿系をまとめたページ。タブはURL(?tab=)で切り替える。 */
export default async function LocapassShopPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { shopId } = await params;
  const { tab } = await searchParams;
  const current = tab === "event" ? "event" : tab === "archive" ? "archive" : "reel";

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/shop/${shopId}/posts?tab=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              current === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {current === "event" ? (
        <EventsTab shopId={shopId} />
      ) : current === "archive" ? (
        <ArchiveTab shopId={shopId} />
      ) : (
        <ReelsTab params={Promise.resolve({ shopId })} />
      )}
    </div>
  );
}
