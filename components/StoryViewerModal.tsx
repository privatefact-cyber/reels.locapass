"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/LocaleProvider";

type StoryMedia = { type: "video" | "image"; url: string };

type StoryItem = {
  id: string;
  media: StoryMedia[];
  caption: string | null;
  createdAt: string;
};

const STORY_DURATION_MS = 5000;

/**
 * フォロー中キャストのストーリーをタップで閲覧するフルスクリーンモーダル。
 * RLS("followers read active stories")がフォロー外のユーザーには何も返さない
 * ので、開く前に呼び出し側でフォロー状態を確認しておくこと(お面思想: フォロー外の
 * 人には「フォローしてね」の案内だけ見せて、ここを開かせない)。
 */
export function StoryViewerModal({
  castId,
  castName,
  onClose,
}: {
  castId: string;
  castName: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [stories, setStories] = useState<StoryItem[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("reels")
      .select("id, media, caption, created_at")
      .eq("cast_id", castId)
      .eq("post_type", "story")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setStories(
          (data ?? []).map((r) => ({
            id: r.id,
            media: r.media as StoryMedia[],
            caption: r.caption,
            createdAt: r.created_at,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [castId]);

  const current = stories?.[index];

  useEffect(() => {
    if (!current || current.media[0]?.type === "video") return;
    const timer = setTimeout(() => {
      if (stories && index < stories.length - 1) setIndex(index + 1);
      else onClose();
    }, STORY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, index, stories, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.close}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <X size={20} />
      </button>

      {stories && stories.length > 0 && (
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className={`h-full bg-white ${i < index ? "w-full" : i === index ? "w-full" : "w-0"}`} />
            </div>
          ))}
        </div>
      )}

      <div className="absolute left-3 top-8 z-10 text-sm font-semibold text-white drop-shadow">{castName}</div>

      {/* タップで前/次へ */}
      <div className="absolute inset-y-0 left-0 z-10 w-1/3" onClick={() => setIndex((i) => Math.max(0, i - 1))} />
      <div
        className="absolute inset-y-0 right-0 z-10 w-1/3"
        onClick={() => {
          if (stories && index < stories.length - 1) setIndex(index + 1);
          else onClose();
        }}
      />

      {!stories ? (
        <p className="text-sm text-neutral-400">{t.common.loading}</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-neutral-400">{t.cast.storyNotFound}</p>
      ) : current ? (
        <div className="flex h-full w-full max-w-md flex-col items-center justify-center">
          {current.media[0]?.type === "video" ? (
            <video
              src={current.media[0].url}
              className="max-h-full w-full object-contain"
              autoPlay
              playsInline
              onEnded={() => {
                if (index < stories.length - 1) setIndex(index + 1);
                else onClose();
              }}
            />
          ) : current.media[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.media[0].url} alt="" className="max-h-full w-full object-contain" />
          ) : null}
          {current.caption && (
            <p className="absolute bottom-6 left-4 right-4 text-center text-sm text-white drop-shadow">
              {current.caption}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
