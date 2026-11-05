"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { createPet, deletePet, updatePet, type PetProfileInput } from "@/app/pet/actions";
import { ageLabel, humanAge } from "@/lib/pet/calc";
import { BREED_SUGGESTIONS, COAT_COLOR_SUGGESTIONS, VISIBILITY_LABEL, type PetRow, type PetVisibility } from "@/lib/pet/types";
import { PetCard, PetField, petButton, petInput } from "./ui";

type Props = { pet?: PetRow };

/**
 * うちの子のプロフィール(登録・編集)。
 * 項目は、マイクロチップ登録や自治体の防災手帳と同じ並び(名前・品種・毛色・生年月日・性別・体重・登録番号)を基本に、
 * 健康メモ・ペット保険・公開範囲を足している。
 */
export function PetProfileForm({ pet }: Props) {
  const router = useRouter();
  const [f, setF] = useState<PetProfileInput>({
    name: pet?.name ?? "",
    breed: pet?.breed ?? "",
    sex: pet?.sex ?? "unknown",
    neutered: pet?.neutered ?? null,
    birthday: pet?.birthday ?? "",
    birthdayEstimated: pet?.birthday_estimated ?? false,
    coatColor: pet?.coat_color ?? "",
    weightKg: pet?.weight_kg?.toString() ?? "",
    microchipNo: pet?.microchip_no ?? "",
    registrationNo: pet?.registration_no ?? "",
    allergies: pet?.allergies ?? "",
    conditions: pet?.conditions ?? "",
    vetName: pet?.vet_name ?? "",
    insuranceName: pet?.insurance_name ?? "",
    insuranceNo: pet?.insurance_no ?? "",
    features: pet?.features ?? "",
    visibility: pet?.visibility ?? "private",
    cardPublic: pet?.card_public ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof PetProfileInput>(k: K, v: PetProfileInput[K]) => {
    setSaved(false);
    setF((p) => ({ ...p, [k]: v }));
  };

  const age = useMemo(() => ageLabel(f.birthday || null, f.birthdayEstimated), [f.birthday, f.birthdayEstimated]);
  const human = useMemo(() => humanAge(f.birthday || null, f.weightKg ? Number(f.weightKg) : null), [f.birthday, f.weightKg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = pet ? await updatePet(pet.id, f) : await createPet(f);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (pet) {
      setSaved(true);
      router.refresh();
    } else if ("id" in res) {
      router.push(`/pet/${res.id}`);
    }
  }

  async function remove() {
    if (!pet) return;
    if (!confirm(`${pet.name}ちゃんの記録をすべて削除します。手帳・通院・日誌も消え、元に戻せません。よろしいですか?`)) return;
    setBusy(true);
    const res = await deletePet(pet.id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push("/pet");
  }

  const chip = (active: boolean) =>
    `rounded-full border-2 px-4 py-2 text-sm font-bold transition active:scale-95 ${active ? "border-[#FF8E5E] bg-[#FFEBDD] text-[#C2562A]" : "border-[#F1E1CF] bg-white text-[#9C8273]"}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <PetCard className="space-y-4">
        <h3 className="text-sm font-extrabold text-[#FF8E5E]">🐶 きほん</h3>
        <PetField label="お名前 *">
          <input className={petInput} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="例: ここあ" maxLength={40} required />
        </PetField>
        <PetField label="犬種">
          <input className={petInput} list="pet-breeds" value={f.breed} onChange={(e) => set("breed", e.target.value)} placeholder="例: トイ・プードル" />
          <datalist id="pet-breeds">
            {BREED_SUGGESTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </PetField>
        <div>
          <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">性別</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["male", "♂ 男の子"],
                ["female", "♀ 女の子"],
                ["unknown", "未入力"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={chip(f.sex === v)} onClick={() => set("sex", v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">避妊・去勢</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [true, "済み"],
                [false, "まだ"],
                [null, "未入力"],
              ] as const
            ).map(([v, l]) => (
              <button key={String(v)} type="button" className={chip(f.neutered === v)} onClick={() => set("neutered", v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <PetField label="誕生日">
          <input type="date" className={petInput} value={f.birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birthday", e.target.value)} />
        </PetField>
        <label className="flex items-center gap-2 px-1 text-sm font-bold text-[#7A6050]">
          <input type="checkbox" className="h-5 w-5 accent-[#FF8E5E]" checked={f.birthdayEstimated} onChange={(e) => set("birthdayEstimated", e.target.checked)} />
          誕生日は推定(保護犬などで正確にわからない)
        </label>
        {age && (
          <div className="rounded-2xl bg-[#FFF3E6] px-4 py-3 text-sm font-bold text-[#7A6050]">
            🎂 いま <span className="text-lg text-[#EE6A36]">{age}</span>
            {human !== null && <span className="ml-2 text-xs">(人間でいうと約{human}歳)</span>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <PetField label="毛色">
            <input className={petInput} list="pet-coats" value={f.coatColor} onChange={(e) => set("coatColor", e.target.value)} placeholder="例: アプリコット" />
            <datalist id="pet-coats">
              {COAT_COLOR_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </PetField>
          <PetField label="体重(kg)">
            <input className={petInput} inputMode="decimal" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value.replace(/[^\d.]/g, ""))} placeholder="例: 3.2" />
          </PetField>
        </div>
        <PetField label="見た目の特徴" hint="迷子のときに探す人の手がかりになります">
          <textarea className={`${petInput} min-h-[80px]`} value={f.features} onChange={(e) => set("features", e.target.value)} placeholder="例: 右耳だけ茶色、赤い首輪、しっぽが短い" maxLength={300} />
        </PetField>
      </PetCard>

      <PetCard className="space-y-4">
        <h3 className="text-sm font-extrabold text-[#4FBF9F]">🏷️ 登録番号</h3>
        <PetField label="マイクロチップ番号(15桁)">
          <input className={petInput} inputMode="numeric" value={f.microchipNo} onChange={(e) => set("microchipNo", e.target.value.replace(/[^\d]/g, ""))} maxLength={15} placeholder="392…" />
        </PetField>
        <PetField label="鑑札の登録番号" hint="手帳で鑑札を読み取ると自動で入ります">
          <input className={petInput} value={f.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} />
        </PetField>
      </PetCard>

      <PetCard className="space-y-4">
        <h3 className="text-sm font-extrabold text-[#6AADEB]">🩺 けんこうメモ</h3>
        <PetField label="アレルギー">
          <input className={petInput} value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="例: 鶏肉・小麦" />
        </PetField>
        <PetField label="持病・気をつけること">
          <input className={petInput} value={f.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="例: 心臓の薬を毎朝" />
        </PetField>
        <PetField label="かかりつけの動物病院">
          <input className={petInput} value={f.vetName} onChange={(e) => set("vetName", e.target.value)} placeholder="例: しぶや動物病院" />
        </PetField>
        <div className="grid grid-cols-2 gap-3">
          <PetField label="ペット保険">
            <input className={petInput} value={f.insuranceName} onChange={(e) => set("insuranceName", e.target.value)} placeholder="保険会社" />
          </PetField>
          <PetField label="証券番号">
            <input className={petInput} value={f.insuranceNo} onChange={(e) => set("insuranceNo", e.target.value)} />
          </PetField>
        </div>
      </PetCard>

      <PetCard className="space-y-4">
        <h3 className="text-sm font-extrabold text-[#FF8FAB]">🔒 見せる範囲</h3>
        <label className="flex items-start gap-3 rounded-2xl bg-[#FFF8F2] p-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#FF8E5E]" checked={f.cardPublic} onChange={(e) => set("cardPublic", e.target.checked)} />
          <span className="text-sm text-[#7A6050]">
            <b>名刺ページを出す</b>
            <br />
            QRタグや名刺交換で見られるページ。出るのは名前・写真・犬種・年齢だけです(迷子のときは、迷子の情報も出ます)。
          </span>
        </label>
        <div>
          <span className="mb-1 block px-1 text-[13px] font-bold text-[#7A6050]">プロフィールを見られる人</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VISIBILITY_LABEL) as PetVisibility[]).map((v) => (
              <button key={v} type="button" className={chip(f.visibility === v)} onClick={() => set("visibility", v)}>
                {VISIBILITY_LABEL[v]}
              </button>
            ))}
          </div>
          <p className="mt-1 px-1 text-xs text-[#B39C8C]">登録番号・けんこうメモ・保険・手帳・通院の記録は、いつも自分だけです。</p>
        </div>
      </PetCard>

      {error && <p className="rounded-2xl bg-[#FFE4E4] px-4 py-3 text-sm font-bold text-[#D04848]">{error}</p>}
      <button type="submit" disabled={busy} className={`${petButton.primary} w-full`}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        {pet ? (saved ? "保存しました ✓" : "保存する") : "この子を登録する"}
      </button>
      {pet && (
        <button type="button" onClick={remove} disabled={busy} className={`${petButton.ghost} w-full`}>
          <Trash2 size={16} />
          この子の記録を削除
        </button>
      )}
    </form>
  );
}
