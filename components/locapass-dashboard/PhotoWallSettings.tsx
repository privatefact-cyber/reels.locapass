"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShopPhotoWall } from "@/app/dashboard/shop/[shopId]/photos/actions";
import { PHOTO_WALL_PRESETS, type PhotoWallPresetId } from "@/lib/photowall/presets";

/** 店舗ページの背景「写真の壁」のオン/オフと、投稿が少ないときに貼るダミー写真の雰囲気を選ぶ。 */
export function PhotoWallSettings({
  shopId,
  initialEnabled,
  initialPreset,
  defaultPreset,
}: {
  shopId: string;
  initialEnabled: boolean;
  initialPreset: string | null;
  defaultPreset: PhotoWallPresetId;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [preset, setPreset] = useState<string>(initialPreset ?? defaultPreset);
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateShopPhotoWall(shopId, enabled, preset);
        setMessage("保存しました");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">背景の「写真の壁」</h2>
      <p className="text-sm text-slate-600">
        店舗ページの背景に、小さな写真を貼った壁を薄く敷きます。投稿が少ないうちは雰囲気の近いダミー写真が並び、投稿が増えるほどお客様の写真に入れ替わります。
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
        背景に写真の壁を表示する
      </label>
      <label className="block text-sm text-slate-700">
        ダミー写真の雰囲気
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {PHOTO_WALL_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "保存中…" : "保存"}
        </button>
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
    </section>
  );
}
