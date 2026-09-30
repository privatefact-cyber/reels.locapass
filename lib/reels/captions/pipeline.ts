/**
 * リール1本分の字幕生成: 動画取得 → 文字起こし → 翻訳(英・中) → 焼き込み字幕の位置判定 → 保存。
 * 投稿者のセッション付きSupabaseクライアントで書き込む(RLSが「自分のリールだけ」に絞る。service roleは使わない)。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TRANSCRIBE_BYTES, transcribeVideo, type Cue } from "./transcribe";
import { CAPTION_LANGS, detectBurnedInZone, sourceLangCode, translateCues, type CaptionLang } from "./translate";

/** 動画の取得先は自前のR2だけ(任意のURLを取りに行かせない)。 */
export const ALLOWED_VIDEO_PREFIX = "https://media.locapass.net/";

type ReelForCaptions = {
  id: string;
  video_url: string;
  poster_url: string | null;
  shopName: string | null;
};

async function fetchVideo(url: string): Promise<Blob | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`動画の取得に失敗 (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_TRANSCRIBE_BYTES) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_TRANSCRIBE_BYTES) return null;
  return new Blob([buf], { type: res.headers.get("content-type") ?? "video/mp4" });
}

export async function runCaptionPipeline(db: SupabaseClient, reel: ReelForCaptions): Promise<void> {
  const setStatus = async (caption_status: "ready" | "no_speech" | "failed", extra: Record<string, unknown> = {}) => {
    const { error } = await db
      .from("locapass_reels")
      .update({ caption_status, captions_generated_at: new Date().toISOString(), ...extra })
      .eq("id", reel.id);
    if (error) console.error("[captions] status update failed", reel.id, error.message);
  };

  try {
    if (!reel.video_url.startsWith(ALLOWED_VIDEO_PREFIX)) {
      await setStatus("failed");
      return;
    }

    const video = await fetchVideo(reel.video_url);
    if (!video) {
      // 大きすぎる動画は文字起こししない(再試行しても同じなので no_speech 扱いにして止める)。
      await setStatus("no_speech");
      return;
    }

    const fileName = reel.video_url.split("/").pop() || "reel.mp4";
    const [transcription, zone] = await Promise.all([
      transcribeVideo(video, fileName),
      detectBurnedInZone(reel.poster_url),
    ]);

    if (transcription.cues.length === 0) {
      await setStatus("no_speech", { caption_avoid_zone: zone });
      return;
    }

    // 元の言語が ja/en/zh ならそのまま保存し、足りない言語だけ翻訳する。それ以外の言語は3言語とも翻訳。
    const source = sourceLangCode(transcription.language);
    const targets = CAPTION_LANGS.filter((l) => l !== source);
    const translated = await translateCues(transcription.cues, targets, { shopName: reel.shopName });

    const rows: { reel_id: string; lang: CaptionLang; cues: Cue[] }[] = [];
    if (source) rows.push({ reel_id: reel.id, lang: source, cues: transcription.cues });
    for (const lang of targets) {
      const cues = translated[lang];
      if (cues) rows.push({ reel_id: reel.id, lang, cues });
    }

    // 翻訳が1つも取れなかった場合でも、元の言語の字幕があれば使える。何も無ければ失敗扱い。
    if (rows.length === 0) {
      await setStatus("failed", { caption_avoid_zone: zone });
      return;
    }

    const { error } = await db.from("locapass_reel_captions").upsert(rows, { onConflict: "reel_id,lang" });
    if (error) throw new Error(`字幕の保存に失敗: ${error.message}`);

    await setStatus("ready", { caption_avoid_zone: zone });
  } catch (cause) {
    console.error("[captions] pipeline failed", reel.id, cause);
    await setStatus("failed");
  }
}
