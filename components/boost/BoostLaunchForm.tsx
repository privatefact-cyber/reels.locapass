"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { SingleImageDropzone } from "@/components/locapass-dashboard/EventImageDropzone";
import { BOOST_TAGS } from "@/lib/boost/types";
import { launchBoost } from "@/app/dashboard/shop/[shopId]/boost/actions";

/** 店舗向けの緊急ブースト発射フォーム。スマホで最短入力できるよう、必須はタイトルと詳細だけ。 */
export function BoostLaunchForm({ shopId, defaultImage }: { shopId: string; defaultImage: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await launchBoost(shopId, { title, description, imageUrl: image, discountTag: tag || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setDescription("");
      setTag("");
      setImage(null);
      setDone(true);
      router.refresh();
    });
  }

  const inputCls = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-300 bg-white p-4 text-slate-900 shadow-sm">
      <div>
        <label className="text-sm font-bold">タイトル <span className="text-red-600">*</span></label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="例:【12人前キャンセル】ドリンク代のみで無料提供!" className={inputCls} />
      </div>
      <div>
        <label className="text-sm font-bold">詳細メッセージ <span className="text-red-600">*</span></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={4} placeholder="条件・人数・来店してほしい時間帯など" className={inputCls} />
      </div>
      <div>
        <label className="text-sm font-bold">割引/特典タグ(任意)</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {BOOST_TAGS.map((t) => (
            <button key={t} type="button" onClick={() => setTag(tag === t ? "" : t)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tag === t ? "border-amber-500 bg-amber-400 text-black" : "border-slate-300 bg-white text-slate-700"}`}>
              {t}
            </button>
          ))}
        </div>
        <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={20} placeholder="自由入力もできます(20文字まで)" className={inputCls} />
      </div>
      <SingleImageDropzone shopId={shopId} name="boost_image" label="写真(任意・未設定なら店舗の写真)" defaultUrl={image} onChange={setImage} boxClassName="h-36 w-full" />
      {!image && defaultImage && <p className="text-[11px] text-slate-500">写真を選ばない場合は店舗のカバー写真が使われます。</p>}
      <p className="text-xs text-slate-600">掲載時間は <b>60分</b> 固定です。お客様はこの情報を見てそのままご来店し、「locapassを見た」とお伝えします。</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {done && <p className="text-sm font-semibold text-emerald-700">発射しました! ブースト一覧に掲載中です。</p>}
      <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-lg font-black text-black shadow disabled:opacity-60 active:scale-95">
        <Zap className="h-5 w-5 fill-black" /> {pending ? "発射中..." : "⚡️ 緊急ブーストを発射する"}
      </button>
    </form>
  );
}
