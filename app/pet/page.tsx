import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getPetViewer } from "@/lib/pet/db";
import { getMyPets } from "@/lib/pet/queries";
import { getPetSpots } from "@/lib/pet/spots";
import { ageLabel, daysBetween, daysToBirthday, expiryStatus, formatJpDate, latestByType, todayJst } from "@/lib/pet/calc";
import { DOC_TYPE_EMOJI, DOC_TYPE_SHORT, SEX_LABEL, type PetDocumentRow } from "@/lib/pet/types";
import { PetAvatar, PetCard, PetSectionTitle, StatusPill, petButton } from "@/components/pet/ui";
import { VerifiedBadge } from "@/components/pet/VerifiedBadge";

export const dynamic = "force-dynamic";

export default async function PetHomePage() {
  const viewer = await getPetViewer();
  if (!viewer) return <Welcome />;

  const pets = await getMyPets(viewer.supabase);
  const { data: docRows } = pets.length
    ? await viewer.supabase.from("locapass_pet_documents").select("id, pet_id, doc_type, expires_on, administered_on, created_at").in("pet_id", pets.map((p) => p.id))
    : { data: [] };
  const docs = (docRows ?? []) as Pick<PetDocumentRow, "id" | "pet_id" | "doc_type" | "expires_on" | "administered_on" | "created_at">[];
  const today = todayJst();

  // 期限が近い・切れているもの(子ごと・種類ごとに最新の書類だけ)
  const alerts: { petId: string; petName: string; docType: PetDocumentRow["doc_type"]; expiresOn: string; status: "soon" | "expired" }[] = [];
  for (const pet of pets) {
    for (const d of latestByType(docs.filter((x) => x.pet_id === pet.id)).values()) {
      const st = expiryStatus(d.expires_on, today);
      if ((st === "soon" || st === "expired") && d.expires_on) alerts.push({ petId: pet.id, petName: pet.name, docType: d.doc_type, expiresOn: d.expires_on, status: st });
    }
  }
  alerts.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));

  // 「ワンコとおでかけ」: 散歩エリアから近い順(未設定なら写真のある店から)8件
  const [spots, { data: settings }] = await Promise.all([
    getPetSpots(),
    viewer.supabase.from("locapass_pet_walk_areas").select("lat, lng").order("created_at").limit(1).maybeSingle(),
  ]);
  const origin = settings ? { lat: settings.lat as number, lng: settings.lng as number } : null;
  const nearbySpots = [...spots]
    .sort((a, b) => {
      if (origin) {
        const d = (s: typeof a) => (s.lat != null && s.lng != null ? (s.lat - origin.lat) ** 2 + ((s.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180)) ** 2 : 1e9);
        return d(a) - d(b);
      }
      return Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    })
    .slice(0, 8);

  return (
    <div>
      <div className="mt-2 flex items-end justify-between px-1">
        <div>
          <p className="text-xs font-bold text-[#B39C8C]">きょうも いっしょに</p>
          <h1 className="text-2xl font-extrabold">うちの子</h1>
        </div>
        {pets.length > 0 && (
          <Link href="/pet/new" className={petButton.soft}>
            <Plus size={16} />
            追加
          </Link>
        )}
      </div>

      {pets.length === 0 ? (
        <PetCard className="mt-4 text-center">
          <p className="text-5xl" aria-hidden>
            🐕
          </p>
          <p className="mt-3 font-extrabold">まずは、うちの子を登録しましょう</p>
          <p className="mt-1 text-sm text-[#9C8273]">ワクチンの手帳・通院の記録・成長日誌・迷子タグが使えるようになります。何頭でも登録できます。</p>
          <Link href="/pet/new" className={`${petButton.primary} mt-4 w-full`}>
            <Plus size={18} />
            うちの子を登録する
          </Link>
        </PetCard>
      ) : (
        <div className="mt-3 space-y-3">
          {pets.map((pet) => {
            const age = ageLabel(pet.birthday, pet.birthday_estimated);
            const bd = daysToBirthday(pet.birthday);
            return (
              <div key={pet.id} className="relative overflow-hidden rounded-[28px] border border-[#F1E1CF] bg-white shadow-[0_6px_20px_-12px_rgba(122,80,40,0.35)]">
                <Link href={`/pet/${pet.id}`} className="block active:opacity-90">
                  <div
                    className="h-20 bg-gradient-to-br from-[#FFD3B8] via-[#FFE7C2] to-[#CDEFE3]"
                    style={pet.coverUrl ? { backgroundImage: `url(${pet.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  />
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <div className="-mt-8">
                      <PetAvatar url={pet.avatarUrl} name={pet.name} size={72} />
                    </div>
                    <div className="min-w-0 flex-1 pt-2">
                      <p className="flex items-center gap-1.5 truncate text-lg font-extrabold">
                        {pet.name}
                        {pet.sex !== "unknown" && <span className={`text-sm ${pet.sex === "male" ? "text-[#6AADEB]" : "text-[#FF8FAB]"}`}>{pet.sex === "male" ? "♂" : "♀"}</span>}
                      </p>
                      <p className="truncate text-xs font-bold text-[#9C8273]">
                        {[pet.breed, age, pet.weight_kg ? `${pet.weight_kg}kg` : null].filter(Boolean).join(" ・ ") || SEX_LABEL[pet.sex]}
                      </p>
                    </div>
                    <ChevronRight className="mt-2 text-[#D9C4B4]" size={20} />
                  </div>
                </Link>
                {/* よく使う記録へすぐ行けるボタン */}
                <div className="grid grid-cols-3 gap-1.5 border-t border-[#F6EBDF] bg-[#FFFCF8] p-2">
                  {[
                    { tab: "notebook", emoji: "💉", label: "ワクチン・狂犬病" },
                    { tab: "diary", emoji: "📔", label: "成長日記" },
                    { tab: "medical", emoji: "🩺", label: "通院の記録" },
                  ].map((b) => (
                    <Link key={b.tab} href={`/pet/${pet.id}?tab=${b.tab}`} className="flex flex-col items-center rounded-2xl py-1.5 text-[11px] font-bold text-[#7A6050] active:bg-[#FFEBDD]">
                      <span className="text-lg" aria-hidden>
                        {b.emoji}
                      </span>
                      {b.label}
                    </Link>
                  ))}
                </div>
                <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
                  {pet.is_lost && <span className="rounded-full bg-[#D04848] px-2.5 py-1 text-xs font-extrabold text-white">迷子のお知らせ中</span>}
                  {bd !== null && bd <= 14 && <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-extrabold text-[#EE6A36]">{bd === 0 ? "🎂 きょう誕生日!" : `🎂 誕生日まで${bd}日`}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={pets.length === 1 ? `/pet/${pets[0].id}/lost` : "/pet/lost#mine"} className="rounded-[24px] bg-[#D04848] px-3 py-3 text-white shadow-[0_4px_0_#A83333] active:translate-y-[2px]">
          <p className="text-sm font-extrabold">🚨 うちの子が迷子</p>
          <p className="text-[11px] opacity-90">近くの人に知らせる</p>
        </Link>
        <Link href="/pet/found/new" className="rounded-[24px] bg-[#2E9C7C] px-3 py-3 text-white shadow-[0_4px_0_#22806A] active:translate-y-[2px]">
          <p className="text-sm font-extrabold">🙋 迷子を見つけた</p>
          <p className="text-[11px] opacity-90">写真と場所で通報</p>
        </Link>
      </div>

      {alerts.length > 0 && (
        <>
          <PetSectionTitle emoji="⏰">もうすぐの予定</PetSectionTitle>
          <PetCard className="divide-y divide-[#F6EBDF] p-0">
            {alerts.map((a) => (
              <Link key={`${a.petId}-${a.docType}`} href={`/pet/${a.petId}?tab=notebook`} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl" aria-hidden>
                  {DOC_TYPE_EMOJI[a.docType]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">
                    {a.petName}ちゃんの{DOC_TYPE_SHORT[a.docType]}
                  </p>
                  <p className="text-xs text-[#9C8273]">
                    期限 {formatJpDate(a.expiresOn)}
                    {a.status === "soon" && `(あと${daysBetween(today, a.expiresOn)}日)`}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </Link>
            ))}
          </PetCard>
        </>
      )}

      {nearbySpots.length > 0 && (
        <>
          <PetSectionTitle
            emoji="🗺️"
            action={
              <Link href="/pet/spots" className="text-xs font-bold text-[#EE6A36]">
                もっと見る
              </Link>
            }
          >
            ワンコとおでかけ
          </PetSectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {nearbySpots.map((s) => (
              <Link key={s.id} href="/pet/spots" className="w-32 shrink-0">
                <div className="overflow-hidden rounded-[20px] border border-[#F1E1CF] bg-white">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-[#E8F3FD] text-3xl">🐾</div>
                  )}
                  <div className="px-2 py-1.5">
                    <VerifiedBadge />
                    <p className="mt-0.5 truncate text-xs font-bold">{s.name}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <Link href="/photo/new" className="mt-3 flex items-center gap-3 rounded-[24px] border-2 border-dashed border-[#FFC9A8] bg-[#FFF3E6] p-3 active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF8E5E] text-xl text-white">📸</span>
        <span className="min-w-0 flex-1 text-xs leading-relaxed text-[#7A6050]">
          <b className="block text-sm text-[#4A3426]">ドッグランで遊んだ?いいカフェあった?</b>
          LOCAPASS snap に投稿してみませんか
        </span>
        <ChevronRight className="shrink-0 text-[#E3A27F]" size={18} />
      </Link>

      <PetSectionTitle emoji="🔔">お知らせの受け取り</PetSectionTitle>
      <Link href="/pet/settings" className="block">
        <PetCard className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#06C755] text-lg font-extrabold text-white">L</span>
          <div className="flex-1 text-sm">
            <p className="font-extrabold">ワクチンの時期をLINEでお知らせ</p>
            <p className="text-xs text-[#9C8273]">期限の30日前・7日前・当日にお届けします</p>
          </div>
          <ChevronRight className="text-[#D9C4B4]" size={20} />
        </PetCard>
      </Link>
    </div>
  );
}

function Welcome() {
  return (
    <div className="pt-6 text-center">
      <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD3B8] to-[#CDEFE3] text-7xl shadow-inner" aria-hidden>
        🐶
      </div>
      <h1 className="mt-5 text-2xl font-extrabold">ロカわん</h1>
      <p className="text-xs font-bold tracking-[0.15em] text-[#B39C8C]">
        by{" "}
        <Link href="/" className="underline underline-offset-2">
          LOCAPASS
        </Link>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#7A6050]">
        ワクチンの手帳・通院の記録・成長日誌を
        <br />
        スマホひとつで。迷子のときも、ご近所とつながります。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 text-left">
        {[
          ["💉", "ワクチン手帳", "撮るだけでAIが読み取り、期限をお知らせ"],
          ["🩺", "通院の記録", "症状・お薬・明細をまとめて"],
          ["📈", "成長日誌", "写真と体重グラフで成長を"],
          ["🏷️", "迷子タグ", "QRで見つけた人とつながる"],
        ].map(([e, t, d]) => (
          <PetCard key={t} className="p-3">
            <p className="text-2xl" aria-hidden>
              {e}
            </p>
            <p className="mt-1 text-sm font-extrabold">{t}</p>
            <p className="text-xs text-[#9C8273]">{d}</p>
          </PetCard>
        ))}
      </div>
      <Link href={`/pet/login?redirect=${encodeURIComponent("/pet")}`} className={`${petButton.primary} mt-6 w-full`}>
        ログイン / 無料で会員登録
      </Link>
      <p className="mt-3 text-xs text-[#B39C8C]">LOCAPASSのアカウントでそのまま使えます</p>
    </div>
  );
}
