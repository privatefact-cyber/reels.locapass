"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyImportAction,
  previewImportAction,
  type ApplyImportInput,
} from "@/app/dashboard/shop/importActions";
import type { ImportPreview } from "@/lib/shop/importFromWebsite";

/**
 * 公式サイトのURLから、紹介文・営業時間・電話番号・料金表・写真を取り込むパネル。
 * 読み取った内容はすぐには反映せず、店舗が項目ごとに選んで「反映する」を押したものだけを保存する。
 * 既に入力済みの項目は、上書き事故を防ぐため初期状態でチェックを外しておく。
 */
export function ShopImportPanel({
  defaultUrl,
  current,
}: {
  defaultUrl: string | null;
  current: { description: boolean; hours: boolean; phone: boolean; cover: boolean; hero: boolean };
}) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [applying, startApplying] = useTransition();

  const [useDescription, setUseDescription] = useState(false);
  const [useHours, setUseHours] = useState(false);
  const [usePhone, setUsePhone] = useState(false);
  const [priceChecked, setPriceChecked] = useState<boolean[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [hero, setHero] = useState<string | null>(null);
  const [rights, setRights] = useState(false);

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAppliedMessage(null);
    setPreview(null);
    startLoading(async () => {
      const result = await previewImportAction(url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const p = result.preview;
      setPreview(p);
      setUseDescription(!!p.description && !current.description);
      setUseHours(!!p.business_hours && !current.hours);
      setUsePhone(!!p.phone && !current.phone);
      setPriceChecked(p.price_items.map(() => true));
      setCover(!current.cover ? (p.image_urls[0] ?? null) : null);
      setHero(!current.hero ? (p.image_urls[1] ?? p.image_urls[0] ?? null) : null);
      setRights(false);
    });
  }

  function handleApply() {
    if (!preview) return;
    setError(null);
    const input: ApplyImportInput = {
      description: useDescription ? preview.description : null,
      businessHours: useHours ? preview.business_hours : null,
      phone: usePhone ? preview.phone : null,
      priceItems: preview.price_items.filter((_, i) => priceChecked[i]),
      coverImageUrl: cover,
      heroImageUrl: hero,
      rightsConfirmed: rights,
    };
    startApplying(async () => {
      const result = await applyImportAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAppliedMessage(`反映しました: ${result.applied.join("、")}`);
      setPreview(null);
      router.refresh();
    });
  }

  const nothingFound =
    preview &&
    !preview.description &&
    !preview.business_hours &&
    !preview.phone &&
    preview.price_items.length === 0 &&
    preview.image_urls.length === 0;

  return (
    <section id="shop-import" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">公式サイトから取り込む</h2>
      <p className="mb-3 text-xs text-slate-500">
        お店の公式サイトのURLを入れると、紹介文・営業時間・電話番号・料金表・写真を読み取ります。
        内容を確認して、使う項目だけ反映できます。Instagram・XなどのSNSは各サービスの規約上取り込めません。
      </p>

      <form onSubmit={handlePreview} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "読み取り中…(10秒ほど)" : "読み取る"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {appliedMessage && <p className="mt-3 text-sm text-emerald-700">{appliedMessage}</p>}
      {nothingFound && (
        <p className="mt-3 text-sm text-slate-500">このページからは取り込める情報が見つかりませんでした。</p>
      )}

      {preview && !nothingFound && (
        <div className="mt-4 space-y-4">
          {preview.description && (
            <label className="flex gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={useDescription} onChange={(e) => setUseDescription(e.target.checked)} />
              <span className="text-sm">
                <span className="block text-xs font-semibold text-slate-500">
                  お店紹介文{current.description && "(入力済みの内容を上書きします)"}
                </span>
                <span className="whitespace-pre-wrap text-slate-800">{preview.description}</span>
              </span>
            </label>
          )}
          {preview.business_hours && (
            <label className="flex gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={useHours} onChange={(e) => setUseHours(e.target.checked)} />
              <span className="text-sm">
                <span className="block text-xs font-semibold text-slate-500">
                  営業時間{current.hours && "(入力済みの内容を上書きします)"}
                </span>
                <span className="text-slate-800">{preview.business_hours}</span>
              </span>
            </label>
          )}
          {preview.phone && (
            <label className="flex gap-3 rounded-lg border border-slate-200 p-3">
              <input type="checkbox" checked={usePhone} onChange={(e) => setUsePhone(e.target.checked)} />
              <span className="text-sm">
                <span className="block text-xs font-semibold text-slate-500">
                  電話番号{current.phone && "(入力済みの内容を上書きします)"}
                </span>
                <span className="text-slate-800">{preview.phone}</span>
              </span>
            </label>
          )}

          {preview.price_items.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                料金表(同じ名前の項目が既にある場合は追加しません)
              </p>
              <ul className="space-y-1">
                {preview.price_items.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <label className="flex items-center gap-3 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={priceChecked[i] ?? false}
                        onChange={(e) =>
                          setPriceChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                        }
                      />
                      <span className="flex-1">
                        {item.name}
                        {item.duration_minutes ? `(${item.duration_minutes}分)` : ""}
                      </span>
                      <span>¥{item.price.toLocaleString()}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.image_urls.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                写真(メイン画像・トップ画像に使うものを選んでください)
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {preview.image_urls.map((src) => (
                  <div key={src} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full rounded border border-slate-200 object-cover"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-700">
                      <input type="radio" name="import-cover" checked={cover === src} onChange={() => setCover(src)} />
                      メイン画像
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-700">
                      <input type="radio" name="import-hero" checked={hero === src} onChange={() => setHero(src)} />
                      トップ画像
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-4 text-[11px]">
                <button type="button" onClick={() => setCover(null)} className="text-slate-500 underline">
                  メイン画像は使わない
                </button>
                <button type="button" onClick={() => setHero(null)} className="text-slate-500 underline">
                  トップ画像は使わない
                </button>
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" />
            取り込む写真・文章は当店が権利を持つもの(または使用の許可を得たもの)です。
          </label>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !rights}
            className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {applying ? "反映中…" : "選んだ内容を反映する"}
          </button>
        </div>
      )}
    </section>
  );
}
