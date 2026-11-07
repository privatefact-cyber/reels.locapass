import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePetViewer } from "@/lib/pet/db";
import { getMyPets } from "@/lib/pet/queries";
import { PetAvatar, PetCard } from "@/components/pet/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "写真を投稿", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 「写真を投稿」の入口(ホーム・おでかけ・施設ページから)。どの子の日誌に書くかを選んで、日誌の投稿画面へ。
 * 施設ページから来たときは、その施設を場所に入れた状態で開く(?place= / ?shop=)。
 */
export default async function PetPostPage({ searchParams }: { searchParams: Promise<{ place?: string; shop?: string }> }) {
  const { place, shop } = await searchParams;
  const extra = new URLSearchParams({ tab: "diary", compose: "1" });
  if (place && UUID.test(place)) extra.set("place", place);
  if (shop && UUID.test(shop)) extra.set("shop", shop);
  const self = `/pet/post${place || shop ? `?${new URLSearchParams({ ...(place ? { place } : {}), ...(shop ? { shop } : {}) })}` : ""}`;

  const { supabase } = await requirePetViewer(self);
  const pets = await getMyPets(supabase);
  if (pets.length === 0) redirect("/pet/new");
  if (pets.length === 1) redirect(`/pet/${pets[0].id}?${extra}`);

  return (
    <div className="pt-2">
      <h1 className="px-1 text-xl font-extrabold">どの子の写真?</h1>
      <p className="mt-1 px-1 text-xs text-[#9C8273]">成長日誌に書いて、「公開」にするとうちの子自慢に並びます。場所を付けると LOCAPASS snap にも載ります。</p>
      <div className="mt-3 space-y-2">
        {pets.map((p) => (
          <Link key={p.id} href={`/pet/${p.id}?${extra}`} className="block">
            <PetCard className="flex items-center gap-3 p-3">
              <PetAvatar url={p.avatarUrl} name={p.name} size={52} ring={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{p.name}</span>
                <span className="block truncate text-xs text-[#9C8273]">{p.breed ?? ""}</span>
              </span>
              <ChevronRight className="text-[#D9C4B4]" size={20} />
            </PetCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
