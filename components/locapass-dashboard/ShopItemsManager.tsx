"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteItem, saveItem, setItemStatus, type ItemInput } from "@/app/dashboard/shop/[shopId]/items/actions";
import { scanVehicleCert } from "@/lib/vehicle/scanClient";
import { ITEM_STATUSES, ITEM_STATUS_LABEL, formatItemPrice, vehicleSpecs, type ItemStatus, type ShopItem } from "@/lib/shop/items";

const MAX_IMAGES = 12;
// 管理画面は日本語のみ。辞書(巨大)をクライアントに読み込まないよう、必要な文言だけここに持つ。
const JA = { priceAsk: "価格はお問い合わせください", specYear: "年式", specMileage: "走行距離", specInspection: "車検", specColor: "色", specModel: "型式", specDisplacement: "排気量", specFuel: "燃料", specSeats: "乗車定員" };
const MAX_EDGE = 1600;

/** 端末の写真は大きいので、長辺1600pxのJPEGに縮めてからアップロードする(縮められなければ元のまま)。 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function uploadImage(shopId: string, file: File): Promise<string> {
  const supabase = createClient();
  const blob = await shrink(file);
  const path = `${shopId}/item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("locapass-reels").upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (error) throw new Error(`アップロードに失敗しました: ${error.message}`);
  return supabase.storage.from("locapass-reels").getPublicUrl(path).data.publicUrl;
}

type Draft = {
  id: string | null;
  title: string;
  price: string;
  priceLabel: string;
  status: ItemStatus;
  description: string;
  imageUrls: string[];
  year: string;
  mileageKm: string;
  inspection: string;
  color: string;
  modelCode: string;
  vin: string;
  displacement: string;
  fuel: string;
  seats: string;
  bodyType: string;
};

const EMPTY: Draft = {
  id: null,
  title: "",
  price: "",
  priceLabel: "",
  status: "available",
  description: "",
  imageUrls: [],
  year: "",
  mileageKm: "",
  inspection: "",
  color: "",
  modelCode: "",
  vin: "",
  displacement: "",
  fuel: "",
  seats: "",
  bodyType: "",
};

function toDraft(item: ShopItem): Draft {
  return {
    id: item.id,
    title: item.title,
    price: item.price == null ? "" : String(item.price),
    priceLabel: item.price_label ?? "",
    status: item.status,
    description: item.description ?? "",
    imageUrls: item.image_urls,
    year: item.attributes?.year ?? "",
    mileageKm: item.attributes?.mileage_km != null ? String(item.attributes.mileage_km) : "",
    inspection: item.attributes?.inspection ?? "",
    color: item.attributes?.color ?? "",
    modelCode: item.attributes?.model_code ?? "",
    vin: item.attributes?.vin ?? "",
    displacement: item.attributes?.displacement_cc != null ? String(item.attributes.displacement_cc) : "",
    fuel: item.attributes?.fuel ?? "",
    seats: item.attributes?.seats != null ? String(item.attributes.seats) : "",
    bodyType: item.attributes?.body_type ?? "",
  };
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500";
const labelCls = "mb-1 block text-xs font-semibold text-slate-600";

/** 車のページのURLをコピーするボタン。リールの「リンク先URL」に貼ると、リールからその車のページに飛べる。 */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // クリップボードが使えない環境では、URLを選択できる入力欄を出す代わりに、ダイアログで見せる。
      window.prompt("このURLをコピーしてください", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold hover:bg-slate-200">
      {copied ? "コピーしました" : "URLをコピー"}
    </button>
  );
}

export function ShopItemsManager({ shopId, items, itemBaseUrl }: { shopId: string; items: ShopItem[]; /** 車のページのURLの共通部分(…/items)。この後ろに車のIDを付ける。 */ itemBaseUrl: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function handleFiles(files: FileList | null) {
    if (!draft) return;
    const room = MAX_IMAGES - draft.imageUrls.length;
    const list = Array.from(files ?? []).slice(0, Math.max(0, room));
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of list) urls.push(await uploadImage(shopId, f));
      setDraft((d) => (d ? { ...d, imageUrls: [...d.imageUrls, ...urls] } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** 車検証の写真を読み取って、入力欄に入れる。空の欄だけ埋め(入力済みの車名は上書きしない)、読めた項目は確認してもらう。 */
  async function scanCert(file: File | undefined) {
    if (!file || !draft) return;
    setScanning(true);
    setError(null);
    setScanNote(null);
    try {
      const f = await scanVehicleCert(shopId, file);
      setDraft((d) => {
        if (!d) return d;
        return {
          ...d,
          title: d.title.trim() ? d.title : f.title ?? "",
          year: f.year ?? d.year,
          inspection: f.inspection ?? d.inspection,
          modelCode: f.model_code ?? d.modelCode,
          vin: f.vin ?? d.vin,
          displacement: f.displacement_cc != null ? String(f.displacement_cc) : d.displacement,
          fuel: f.fuel ?? d.fuel,
          seats: f.seats != null ? String(f.seats) : d.seats,
          bodyType: f.body_type ?? d.bodyType,
        };
      });
      setScanNote("車検証から読み取りました。内容に間違いがないか確認してください(車名は「ポルシェ 911 GT3」のようにグレードまで書き足すと伝わりやすくなります)。所有者の名前・住所などは読み取らず、保存もしません。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました");
    } finally {
      setScanning(false);
      if (certRef.current) certRef.current.value = "";
    }
  }

  function save() {
    if (!draft) return;
    const priceNum = draft.price.trim() === "" ? null : Number(draft.price.replace(/[,，]/g, ""));
    const mileage = draft.mileageKm.trim() === "" ? null : Number(draft.mileageKm.replace(/[,，]/g, ""));
    if ((priceNum != null && !Number.isFinite(priceNum)) || (mileage != null && !Number.isFinite(mileage))) {
      setError("価格・走行距離は数字で入力してください");
      return;
    }
    const input: ItemInput = {
      title: draft.title,
      price: priceNum,
      priceLabel: draft.priceLabel,
      status: draft.status,
      description: draft.description,
      imageUrls: draft.imageUrls,
      year: draft.year,
      mileageKm: mileage,
      inspection: draft.inspection,
      color: draft.color,
      modelCode: draft.modelCode,
      vin: draft.vin,
      displacementCc: draft.displacement.trim() === "" ? null : Number(draft.displacement.replace(/[,，]/g, "")),
      fuel: draft.fuel,
      seats: draft.seats.trim() === "" ? null : Number(draft.seats),
      bodyType: draft.bodyType,
    };
    setError(null);
    startTransition(async () => {
      try {
        await saveItem(shopId, draft.id, input);
        setDraft(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  function changeStatus(id: string, status: ItemStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await setItemStatus(shopId, id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  }

  function remove(item: ShopItem) {
    if (!window.confirm(`「${item.title}」を削除します。元に戻せません。よろしいですか?(売れた車は「売約済み」にすると履歴として残せます)`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteItem(shopId, item.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">登録した車両は、店舗ページの「在庫」に表示されます。</p>
        {!draft && (
          <button type="button" onClick={() => { setDraft({ ...EMPTY }); setError(null); }} className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
            ＋ 車両を追加
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {draft && (
        <section className="space-y-4 rounded-xl border border-sky-300 bg-white p-4">
          <h2 className="text-sm font-bold">{draft.id ? "車両を編集" : "車両を追加"}</h2>

          <div className="rounded-lg border border-dashed border-sky-300 bg-sky-50 p-3">
            <input ref={certRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanCert(e.target.files?.[0])} />
            <button type="button" disabled={scanning} onClick={() => certRef.current?.click()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
              {scanning ? "読み取り中..." : "📷 車検証をスキャンして自動入力"}
            </button>
            <p className="mt-2 text-xs text-slate-600">車検証の全体が写るように撮影してください。車名・年式・車検・型式などが入ります(走行距離と価格は手入力です)。</p>
            {scanNote && <p className="mt-2 text-xs font-semibold text-emerald-700">{scanNote}</p>}
          </div>

          <div>
            <label className={labelCls}>車名・グレード(必須)</label>
            <input className={inputCls} value={draft.title} maxLength={80} placeholder="例: ポルシェ 911 カレラ S" onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>価格(円)</label>
              <input className={inputCls} inputMode="numeric" value={draft.price} placeholder="例: 2550000" onChange={(e) => set("price", e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-500">万円で割り切れる額は「255万円」と表示されます。</p>
            </div>
            <div>
              <label className={labelCls}>価格の表記(任意・入れると価格より優先)</label>
              <input className={inputCls} value={draft.priceLabel} maxLength={20} placeholder="例: 応談 / 支払総額 298万円" onChange={(e) => set("priceLabel", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>年式</label>
              <input className={inputCls} value={draft.year} maxLength={20} placeholder="例: 2006年(H18)" onChange={(e) => set("year", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>走行距離(km)</label>
              <input className={inputCls} inputMode="numeric" value={draft.mileageKm} placeholder="例: 48000" onChange={(e) => set("mileageKm", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>車検</label>
              <input className={inputCls} value={draft.inspection} maxLength={30} placeholder="例: R8年10月 / 車検整備付" onChange={(e) => set("inspection", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>色</label>
              <input className={inputCls} value={draft.color} maxLength={30} placeholder="例: ミアミブルー" onChange={(e) => set("color", e.target.value)} />
            </div>
          </div>

          <details className="rounded-lg border border-slate-200 p-3" open={!!(draft.modelCode || draft.vin || draft.displacement || draft.fuel || draft.seats)}>
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">車検証の情報(任意・スキャンで入ります)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>型式</label><input className={inputCls} value={draft.modelCode} onChange={(e) => set("modelCode", e.target.value)} /></div>
              <div><label className={labelCls}>車台番号(サイトには出ません)</label><input className={inputCls} value={draft.vin} onChange={(e) => set("vin", e.target.value)} /></div>
              <div><label className={labelCls}>排気量(cc)</label><input className={inputCls} inputMode="numeric" value={draft.displacement} onChange={(e) => set("displacement", e.target.value)} /></div>
              <div><label className={labelCls}>燃料</label><input className={inputCls} value={draft.fuel} onChange={(e) => set("fuel", e.target.value)} placeholder="例: ガソリン" /></div>
              <div><label className={labelCls}>乗車定員</label><input className={inputCls} inputMode="numeric" value={draft.seats} onChange={(e) => set("seats", e.target.value)} /></div>
              <div><label className={labelCls}>車体の形状</label><input className={inputCls} value={draft.bodyType} onChange={(e) => set("bodyType", e.target.value)} placeholder="例: クーペ" /></div>
            </div>
          </details>

          <div>
            <label className={labelCls}>状態</label>
            <select className={inputCls} value={draft.status} onChange={(e) => set("status", e.target.value as ItemStatus)}>
              {ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}{s === "hidden" ? "(公開しない)" : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>説明(任意・1000文字まで)</label>
            <textarea className={inputCls} rows={4} value={draft.description} maxLength={1000} placeholder="修復歴・整備内容・装備などを自由に" onChange={(e) => set("description", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>写真({draft.imageUrls.length}/{MAX_IMAGES}・先頭が一覧の代表写真になります)</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {draft.imageUrls.map((url, i) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-20 w-28 rounded object-cover" />
                  <div className="mt-1 flex gap-1">
                    {i > 0 && (
                      <button type="button" onClick={() => set("imageUrls", [url, ...draft.imageUrls.filter((u) => u !== url)])} className="flex-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700 hover:bg-sky-100">先頭へ</button>
                    )}
                    <button type="button" onClick={() => set("imageUrls", draft.imageUrls.filter((u) => u !== url))} className="flex-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700 hover:bg-red-100 hover:text-red-700">削除</button>
                  </div>
                </div>
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <button type="button" disabled={uploading || draft.imageUrls.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
              {uploading ? "アップロード中..." : "写真を追加(複数選択可)"}
            </button>
          </div>

          <div className="flex gap-2">
            <button type="button" disabled={pending || uploading} onClick={save} className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
              {pending ? "保存中..." : "保存する"}
            </button>
            <button type="button" disabled={pending} onClick={() => { setDraft(null); setError(null); }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
              キャンセル
            </button>
          </div>
        </section>
      )}

      {items.length === 0 && !draft && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">まだ車両が登録されていません。「＋ 車両を追加」から登録してください。</p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const specs = vehicleSpecs(item.attributes, "ja", JA);
          return (
            <li key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              {item.image_urls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_urls[0]} alt="" className="h-20 w-28 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded bg-slate-100 text-[11px] text-slate-400">写真なし</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.title}</p>
                <p className="text-sm font-semibold text-sky-700">{formatItemPrice(item, "ja", JA)}</p>
                {specs.length > 0 && <p className="truncate text-xs text-slate-500">{specs.map((s) => `${s.label} ${s.value}`).join(" / ")}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select disabled={pending} value={item.status} onChange={(e) => changeStatus(item.id, e.target.value as ItemStatus)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                    {ITEM_STATUSES.map((s) => (
                      <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => { setDraft(toDraft(item)); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold hover:bg-slate-200">編集</button>
                  {item.status !== "hidden" && <CopyUrlButton url={`${itemBaseUrl}/${item.id}`} />}
                  <button type="button" disabled={pending} onClick={() => remove(item)} className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">削除</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
