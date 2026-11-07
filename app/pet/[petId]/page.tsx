import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, QrCode } from "lucide-react";
import { petAdmin, requirePetViewer, signPetImages } from "@/lib/pet/db";
import { getPetPlace } from "@/lib/pet/spots";
import { getMyPets } from "@/lib/pet/queries";
import { ageLabel, daysBetween, expiryStatus, formatJpDate, humanAge, latestByType, todayJst } from "@/lib/pet/calc";
import { DOC_TYPE_EMOJI, DOC_TYPE_LABEL, DOC_TYPE_SHORT, SEX_LABEL, VISIBILITY_LABEL, type PetDiaryRow, type PetDocType, type PetDocumentRow, type PetMedicalRow } from "@/lib/pet/types";
import { PetHero } from "@/components/pet/PetHero";
import { PetAvatar, PetCard, PetSectionTitle, StatusPill, petButton } from "@/components/pet/ui";
import { DocumentScanner } from "@/components/pet/DocumentScanner";
import { MedicalForm } from "@/components/pet/MedicalForm";
import { DiaryForm, type DiaryPresetPlace } from "@/components/pet/DiaryForm";
import { WeightChart } from "@/components/pet/WeightChart";
import { PetDeleteButton } from "@/components/pet/DeleteButton";
import { LocalImage, LocalImageNotice } from "@/components/pet/LocalImage";
import { PetProfileForm } from "@/components/pet/PetProfileForm";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "notebook", label: "手帳", emoji: "💉" },
  { key: "medical", label: "通院", emoji: "🩺" },
  { key: "diary", label: "日誌", emoji: "📔" },
  { key: "profile", label: "プロフィール", emoji: "🐶" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PetDetailPage({ params, searchParams }: { params: Promise<{ petId: string }>; searchParams: Promise<{ tab?: string; compose?: string; place?: string; shop?: string }> }) {
  const { petId } = await params;
  const { tab: rawTab, compose, place, shop } = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? "notebook") as TabKey;
  const { supabase } = await requirePetViewer(`/pet/${petId}`);

  const pets = await getMyPets(supabase);
  const pet = pets.find((p) => p.id === petId);
  if (!pet) notFound();

  const age = ageLabel(pet.birthday, pet.birthday_estimated);
  const human = humanAge(pet.birthday, pet.weight_kg);

  return (
    <div>
      {/* 多頭飼い: ほかの子へすぐ切り替え */}
      {pets.length > 1 && (
        <div className="-mx-4 mb-2 flex gap-3 overflow-x-auto px-4 pb-1">
          {pets.map((p) => (
            <Link key={p.id} href={`/pet/${p.id}?tab=${tab}`} className="flex shrink-0 flex-col items-center gap-1">
              <span className={`rounded-full p-0.5 ${p.id === pet.id ? "bg-gradient-to-br from-[#FF8E5E] to-[#FFC94D]" : "bg-transparent"}`}>
                <PetAvatar url={p.avatarUrl} name={p.name} size={44} ring={p.id === pet.id} />
              </span>
              <span className={`max-w-[56px] truncate text-[11px] font-bold ${p.id === pet.id ? "text-[#EE6A36]" : "text-[#B39C8C]"}`}>{p.name}</span>
            </Link>
          ))}
          <Link href="/pet/new" className="flex shrink-0 flex-col items-center gap-1">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-[#E8D3BF] text-xl text-[#C9B3A3]">+</span>
            <span className="text-[11px] font-bold text-[#C9B3A3]">追加</span>
          </Link>
        </div>
      )}

      <PetHero petId={pet.id} name={pet.name} avatarUrl={pet.avatarUrl} coverUrl={pet.coverUrl} editable>
        <p className="mt-1 text-center text-sm font-bold text-[#9C8273]">
          {[pet.breed, pet.sex !== "unknown" ? SEX_LABEL[pet.sex] : null].filter(Boolean).join(" ・ ")}
        </p>
        <div className="mt-3 grid w-full grid-cols-3 gap-2">
          {[
            { label: "年齢", value: age ?? "ー", sub: human !== null ? `人間で約${human}歳` : null },
            { label: "体重", value: pet.weight_kg ? `${pet.weight_kg}kg` : "ー", sub: null },
            { label: "誕生日", value: pet.birthday ? `${Number(pet.birthday.slice(5, 7))}/${Number(pet.birthday.slice(8, 10))}` : "ー", sub: pet.birthday ? pet.birthday.slice(0, 4) + "年" : null },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-white px-2 py-2 text-center shadow-[0_4px_14px_-10px_rgba(122,80,40,0.5)]">
              <p className="text-[10px] font-bold text-[#B39C8C]">{s.label}</p>
              <p className="truncate text-sm font-extrabold">{s.value}</p>
              {s.sub && <p className="truncate text-[10px] text-[#B39C8C]">{s.sub}</p>}
            </div>
          ))}
        </div>
        <div className="mt-3 grid w-full grid-cols-2 gap-2">
          <Link href={`/pet/${pet.id}/tag`} className={petButton.soft}>
            <QrCode size={16} />
            名刺・迷子QR
          </Link>
          <Link href={`/pet/${pet.id}/lost`} className={pet.is_lost ? "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#D04848] px-4 py-2.5 text-sm font-bold text-white" : petButton.soft}>
            <AlertTriangle size={16} />
            {pet.is_lost ? "迷子のお知らせ中" : "迷子になったら"}
          </Link>
        </div>
      </PetHero>

      <nav className="sticky top-14 z-20 -mx-4 mt-4 bg-[#FFF7EC]/90 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-white p-1 shadow-[0_4px_14px_-10px_rgba(122,80,40,0.5)]">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/pet/${pet.id}?tab=${t.key}`}
              replace
              scroll={false}
              className={`rounded-full py-2 text-center text-xs font-extrabold transition ${tab === t.key ? "bg-[#FF8E5E] text-white shadow-[0_2px_0_#EE6A36]" : "text-[#9C8273]"}`}
            >
              <span aria-hidden>{t.emoji}</span> {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-2">
        {tab === "notebook" && <NotebookTab petId={pet.id} petName={pet.name} supabase={supabase} />}
        {tab === "medical" && <MedicalTab petId={pet.id} vetName={pet.vet_name} supabase={supabase} />}
        {tab === "diary" && <DiaryTab petId={pet.id} supabase={supabase} compose={compose === "1"} placeId={place} shopId={shop} />}
        {tab === "profile" && (
          <div className="mt-2">
            <PetProfileForm pet={pet} />
          </div>
        )}
      </div>
    </div>
  );
}

type Sb = Awaited<ReturnType<typeof requirePetViewer>>["supabase"];

async function NotebookTab({ petId, petName, supabase }: { petId: string; petName: string; supabase: Sb }) {
  const { data } = await supabase
    .from("locapass_pet_documents")
    .select("id, pet_id, doc_type, title, administered_on, expires_on, clinic_name, vaccine_name, registration_no, note, image_path, created_at")
    .eq("pet_id", petId)
    .order("administered_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const docs = (data ?? []) as PetDocumentRow[];
  const latest = latestByType(docs);
  // 書類の画像は、10分で切れるリンクでだけ見せる
  const signed = await signPetImages(docs.map((d) => d.image_path), 600);
  const today = todayJst();
  const summary: PetDocType[] = ["rabies", "mixed_vaccine", "license", "insurance"];

  return (
    <div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {summary.map((t) => {
          const d = latest.get(t);
          const st = d ? (t === "license" ? "valid" : expiryStatus(d.expires_on, today)) : null;
          return (
            <PetCard key={t} className="px-1.5 py-3 text-center">
              <p className="text-2xl" aria-hidden>
                {DOC_TYPE_EMOJI[t]}
              </p>
              <p className="mt-1 text-xs font-extrabold">{DOC_TYPE_SHORT[t]}</p>
              {d && st ? (
                <>
                  <div className="mt-1.5">{t === "license" ? <span className="rounded-full bg-[#DDF5EC] px-2.5 py-1 text-xs font-extrabold text-[#2E9C7C]">登録済み</span> : <StatusPill status={st} />}</div>
                  {t !== "license" && d.expires_on && (
                    <p className="mt-1 text-[10px] font-bold text-[#9C8273]">
                      {st === "expired" ? "期限 " : "次 "}
                      {d.expires_on.slice(0, 4)}/{Number(d.expires_on.slice(5, 7))}/{Number(d.expires_on.slice(8, 10))}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[11px] font-bold text-[#C9B3A3]">未登録</p>
              )}
            </PetCard>
          );
        })}
      </div>

      <div className="mt-4">
        <DocumentScanner petId={petId} />
      </div>

      <PetSectionTitle emoji="📒">{petName}ちゃんの手帳</PetSectionTitle>
      {docs.length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">
          狂犬病の注射済票・鑑札・混合ワクチンの証明書を撮ると、
          <br />
          AIが種類と日付を読み取ってここに並べます。
        </PetCard>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const st = d.doc_type === "license" ? "none" : expiryStatus(d.expires_on, today);
            const img = d.image_path ? signed.get(d.image_path) : null;
            const isLatest = latest.get(d.doc_type)?.id === d.id;
            return (
              <PetCard key={d.id} className={`flex gap-3 ${isLatest ? "" : "opacity-70"}`}>
                {d.image_path?.startsWith("local:") ? (
                  <LocalImage refId={d.image_path} className="h-16 w-16 rounded-2xl" fileName={`${DOC_TYPE_SHORT[d.doc_type]}.jpg`} migrate={{ kind: "document", petId, recordId: d.id }} />
                ) : img ? (
                  <a href={img} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={DOC_TYPE_LABEL[d.doc_type]} referrerPolicy="no-referrer" className="h-16 w-16 rounded-2xl object-cover" />
                  </a>
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FFF3E6] text-2xl" aria-hidden>
                    {DOC_TYPE_EMOJI[d.doc_type]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-extrabold">{DOC_TYPE_LABEL[d.doc_type]}</p>
                    {d.doc_type !== "license" && isLatest && <StatusPill status={st} />}
                  </div>
                  <p className="mt-0.5 text-xs text-[#7A6050]">
                    {d.doc_type === "license" ? "登録日" : "接種日"} {formatJpDate(d.administered_on)}
                    {d.expires_on && (
                      <>
                        <br />
                        次の期限 {formatJpDate(d.expires_on)}
                        {st === "soon" && <b className="text-[#B7860B]">(あと{daysBetween(today, d.expires_on)}日)</b>}
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[#B39C8C]">{[d.clinic_name, d.vaccine_name, d.registration_no ? `No.${d.registration_no}` : null, d.note].filter(Boolean).join(" ・ ")}</p>
                  <div className="mt-1 text-right">
                    <PetDeleteButton kind="document" id={d.id} localRefs={[d.image_path]} />
                  </div>
                </div>
              </PetCard>
            );
          })}
        </div>
      )}
      <p className="mt-4 px-2 text-center text-[11px] text-[#B39C8C]">🔒 手帳はあなただけが見られます。期限の30日前・7日前・当日にお知らせします。</p>
      <div className="mt-1">
        <LocalImageNotice />
      </div>
    </div>
  );
}

async function MedicalTab({ petId, vetName, supabase }: { petId: string; vetName: string | null; supabase: Sb }) {
  const { data } = await supabase
    .from("locapass_pet_medical_records")
    .select("id, pet_id, visited_on, hospital, symptoms, diagnosis, medicines, cost, note, image_paths, created_at")
    .eq("pet_id", petId)
    .order("visited_on", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as PetMedicalRow[];
  const signed = await signPetImages(rows.flatMap((r) => r.image_paths), 600);
  const yearTotal = rows.filter((r) => r.visited_on.startsWith(todayJst().slice(0, 4))).reduce((s, r) => s + (r.cost ?? 0), 0);

  return (
    <div>
      <div className="mt-2">
        <MedicalForm petId={petId} defaultHospital={vetName} />
      </div>
      {yearTotal > 0 && (
        <PetCard className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-[#9C8273]">ことしの医療費</span>
          <span className="text-xl font-extrabold">¥{yearTotal.toLocaleString()}</span>
        </PetCard>
      )}
      <PetSectionTitle emoji="🗓️">通院・体調の記録</PetSectionTitle>
      {rows.length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">体調の変化や通院を記録しておくと、病院で説明するときに役立ちます。</PetCard>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-dashed border-[#F1E1CF] pl-4">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 border-white bg-[#6AADEB]" />
              <PetCard>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-extrabold">{formatJpDate(r.visited_on)}</p>
                  {r.cost != null && <span className="text-sm font-extrabold text-[#7A6050]">¥{r.cost.toLocaleString()}</span>}
                </div>
                {r.hospital && <p className="text-xs font-bold text-[#6AADEB]">🏥 {r.hospital}</p>}
                <dl className="mt-1 space-y-0.5 text-sm text-[#5C4535]">
                  {r.symptoms && <Row k="症状" v={r.symptoms} />}
                  {r.diagnosis && <Row k="診断" v={r.diagnosis} />}
                  {r.medicines && <Row k="お薬" v={r.medicines} />}
                  {r.note && <Row k="メモ" v={r.note} />}
                </dl>
                {r.image_paths.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {r.image_paths.map((p) =>
                      p.startsWith("local:") ? (
                        <LocalImage key={p} refId={p} className="h-16 w-16 rounded-xl" fileName="通院明細.jpg" size="small" migrate={{ kind: "medical", petId, recordId: r.id }} />
                      ) : signed.get(p) ? (
                        <a key={p} href={signed.get(p)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={signed.get(p)} alt="" className="h-16 w-16 rounded-xl object-cover" />
                        </a>
                      ) : null,
                    )}
                  </div>
                )}
                <div className="mt-1 text-right">
                  <PetDeleteButton kind="medical" id={r.id} localRefs={r.image_paths} />
                </div>
              </PetCard>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 px-2 text-center text-[11px] text-[#B39C8C]">🔒 通院の記録はあなただけが見られます。</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-xs font-bold leading-5 text-[#B39C8C]">{k}</dt>
      <dd className="whitespace-pre-wrap break-words">{v}</dd>
    </div>
  );
}

async function DiaryTab({ petId, supabase, compose, placeId, shopId }: { petId: string; supabase: Sb; compose: boolean; placeId?: string; shopId?: string }) {
  const [{ data }, { data: walk }, presetPlace] = await Promise.all([
    supabase
      .from("locapass_pet_diary_entries")
      .select("id, pet_id, entry_date, weight_kg, body, image_paths, visibility, created_at, like_count, snap_post_id, hidden_at")
      .eq("pet_id", petId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("locapass_pet_walk_areas").select("lat, lng, label"),
    getDiaryPresetPlace(placeId, shopId),
  ]);
  const rows = (data ?? []) as (PetDiaryRow & { like_count: number; snap_post_id: string | null; hidden_at: string | null })[];
  const walkAreas = ((walk ?? []) as { lat: number; lng: number; label: string | null }[]).map((w) => ({ lat: Number(w.lat), lng: Number(w.lng), label: w.label }));
  const signed = await signPetImages(rows.flatMap((r) => r.image_paths));
  const weights = rows.filter((r) => r.weight_kg != null).map((r) => ({ date: r.entry_date, kg: Number(r.weight_kg) }));

  return (
    <div>
      <PetCard className="mt-2">
        <p className="mb-1 text-sm font-extrabold text-[#EE6A36]">📈 体重のきろく</p>
        <WeightChart points={weights} />
      </PetCard>
      <div className="mt-3">
        <DiaryForm petId={petId} walkAreas={walkAreas} presetPlace={presetPlace} autoOpen={compose} />
      </div>
      <PetSectionTitle emoji="📔">成長日誌</PetSectionTitle>
      {rows.length === 0 ? (
        <PetCard className="text-center text-sm text-[#9C8273]">写真と体重を残していくと、成長がひと目でわかります。</PetCard>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <PetCard key={r.id} className="overflow-hidden p-0">
              {r.image_paths.length > 0 && (
                <div className={`grid gap-0.5 ${r.image_paths.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {r.image_paths.map((p) =>
                    signed.get(p) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p} src={signed.get(p)} alt="" className="aspect-square w-full object-cover" />
                    ) : null,
                  )}
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold">{formatJpDate(r.entry_date)}</p>
                  <div className="flex items-center gap-1.5">
                    {r.weight_kg != null && <span className="rounded-full bg-[#FFEBDD] px-2.5 py-0.5 text-xs font-extrabold text-[#C2562A]">⚖️ {r.weight_kg}kg</span>}
                    <span className="rounded-full bg-[#F4EEE8] px-2 py-0.5 text-[10px] font-bold text-[#9C8273]">{VISIBILITY_LABEL[r.visibility]}</span>
                  </div>
                </div>
                {r.body && <p className="mt-1 whitespace-pre-wrap text-sm text-[#5C4535]">{r.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  {r.visibility === "public" && r.image_paths.length > 0 && !r.hidden_at && (
                    <Link href={`/pet/gallery/${r.id}`} className="rounded-full bg-[#FFF3E6] px-2.5 py-1 text-[#C2562A]">
                      🏆 自慢に掲載中 ・ 🐾 {r.like_count}
                    </Link>
                  )}
                  {r.hidden_at && <span className="rounded-full bg-[#F4EEE8] px-2.5 py-1 text-[#9C8273]">運営により非表示</span>}
                  {r.snap_post_id && (
                    <Link href={`/photo/p/${r.snap_post_id}`} className="rounded-full bg-[#E8F3FD] px-2.5 py-1 text-[#2F6FAE]">
                      📍 snapで見る
                    </Link>
                  )}
                  <span className="ml-auto">
                    <PetDeleteButton kind="diary" id={r.id} />
                  </span>
                </div>
              </div>
            </PetCard>
          ))}
        </div>
      )}
    </div>
  );
}

/** おでかけ・施設ページの「ここで撮った写真を投稿」から来たときの場所(施設の登録位置) */
async function getDiaryPresetPlace(placeId?: string, shopId?: string): Promise<DiaryPresetPlace | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (placeId && uuid.test(placeId)) {
    const p = await getPetPlace(placeId);
    if (p) return { kind: "place", id: p.id, name: p.name, lat: p.lat, lng: p.lng, address: p.address };
  }
  if (shopId && uuid.test(shopId)) {
    const { data } = await petAdmin().from("locapass_shops").select("id, name, address, lat, lng").eq("id", shopId).eq("status", "active").maybeSingle();
    if (data && data.lat != null && data.lng != null) return { kind: "shop", id: data.id as string, name: data.name as string, lat: data.lat as number, lng: data.lng as number, address: (data.address as string | null) ?? null };
  }
  return null;
}
