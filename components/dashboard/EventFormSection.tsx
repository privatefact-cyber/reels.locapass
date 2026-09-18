"use client";

import { useState } from "react";
import type { ShopEvent } from "@/lib/types/shop";
import { EventGalleryDropzone, SingleImageDropzone } from "./EventImageDropzone";
import { TimeOfDaySelect } from "./TimeOfDaySelect";

function formatRange(event: ShopEvent): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (event.startsAt && event.endsAt) return `${fmt(event.startsAt)} 〜 ${fmt(event.endsAt)}`;
  if (event.startsAt) return `${fmt(event.startsAt)} 〜`;
  if (event.endsAt) return `〜 ${fmt(event.endsAt)}`;
  return "";
}

export function EventFormSection({
  shopId,
  events,
  addEvent,
  deleteEvent,
}: {
  shopId: string;
  events: ShopEvent[];
  addEvent: (formData: FormData) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  async function handleSubmit(formData: FormData) {
    await addEvent(formData);
    setThumbnailUrl(null);
    setKey((k) => k + 1);
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold">イベント告知</h2>
      <p className="mb-3 text-xs text-black/50">
        ここで登録した画像はポータルトップの「イベント」特設リールにも縦長画像として流れます。終了日時を過ぎたイベントはポータルの一覧から自動的に非表示になります。
      </p>
      {events.length > 0 && (
        <ul className="mb-4 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 rounded border border-black/10 p-3 text-sm">
              {e.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.imageUrl}
                  alt={e.title}
                  className="h-20 w-14 shrink-0 rounded object-cover"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {e.title}
                    {e.isEnded && (
                      <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-black/50">
                        終了
                      </span>
                    )}
                  </span>
                  <form action={deleteEvent.bind(null, e.id)}>
                    <button type="submit" className="text-xs text-black/40 hover:text-red-600">
                      削除
                    </button>
                  </form>
                </div>
                {formatRange(e) && <p className="mt-0.5 text-xs text-black/50">{formatRange(e)}</p>}
                {e.body && <p className="mt-1 whitespace-pre-wrap text-black/70">{e.body}</p>}
                {e.galleryImageUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.galleryImageUrls.map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" className="h-10 w-10 rounded object-cover" />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form key={key} action={handleSubmit} className="space-y-3">
        <input
          name="title"
          required
          placeholder="タイトル"
          className="w-full rounded border border-black/20 bg-white px-3 py-2 text-sm text-black"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-black/50">開始日</label>
            <div className="mt-1 flex gap-2">
              <input
                name="start_date"
                type="date"
                className="flex-1 rounded border border-black/20 bg-white px-3 py-2 text-sm text-black"
              />
              <TimeOfDaySelect name="start_time" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-black/50">終了日</label>
            <div className="mt-1 flex gap-2">
              <input
                name="end_date"
                type="date"
                className="flex-1 rounded border border-black/20 bg-white px-3 py-2 text-sm text-black"
              />
              <TimeOfDaySelect name="end_time" />
            </div>
          </div>
        </div>

        <SingleImageDropzone
          shopId={shopId}
          name="image_url"
          label="リール用サムネイル画像(必須・推奨サイズ 1080x1920)"
          onChange={setThumbnailUrl}
        />

        <EventGalleryDropzone shopId={shopId} name="gallery_image_urls" />

        <textarea
          name="body"
          placeholder="詳細(任意)"
          rows={3}
          className="w-full rounded border border-black/20 bg-white px-3 py-2 text-sm text-black"
        />

        <button
          type="submit"
          disabled={!thumbnailUrl}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          告知する
        </button>
      </form>
    </section>
  );
}
