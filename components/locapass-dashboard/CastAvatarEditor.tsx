"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { setCastAvatar } from "@/app/dashboard/shop/[shopId]/cast/actions";

/** 店舗管理者が、FACESのアイコンを変更する(円形に切り抜いて保存)。 */
export function CastAvatarEditor({
  shopId,
  castId,
  castName,
  avatarUrl,
  photoUrls,
}: {
  shopId: string;
  castId: string;
  castName: string;
  avatarUrl: string | null;
  photoUrls: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(url: string) {
    await setCastAvatar(shopId, castId, url);
    setDone(true);
    router.refresh();
  }

  async function handleCropped(blob: Blob) {
    setPending(null);
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const supabase = createClient();
      const path = `${castId}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("locapass-cast-media").upload(path, blob, {
        contentType: "image/jpeg",
      });
      if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`);
      const { data } = supabase.storage.from("locapass-cast-media").getPublicUrl(path);
      await save(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アイコンの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function useExisting(url: string) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await save(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アイコンの保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">アイコン</h2>
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={castName} className="h-20 w-20 rounded-full border border-slate-200 bg-slate-100 object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">未設定</div>
        )}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f) setPending(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "保存中..." : "アイコンを変更"}
          </button>
          <p className="mt-1 text-xs text-slate-500">画像を選ぶと、円形に切り抜く画面が開きます。</p>
          {done && <p className="mt-1 text-xs font-medium text-emerald-600">アイコンを更新しました</p>}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {photoUrls.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-slate-500">登録済みの写真から選ぶ</p>
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((u) => (
              <button
                key={u}
                type="button"
                disabled={busy}
                onClick={() => useExisting(u)}
                title="この写真をアイコンにする"
                className={`overflow-hidden rounded-full border-2 ${u === avatarUrl ? "border-emerald-500" : "border-transparent hover:border-slate-300"} disabled:opacity-50`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-14 w-14 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {pending && <AvatarCropModal file={pending} onCancel={() => setPending(null)} onCropped={handleCropped} />}
    </section>
  );
}
