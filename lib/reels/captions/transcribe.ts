/**
 * リール動画の文字起こし(Groq Whisper)。サーバー専用。
 *
 * 費用: whisper-large-v3-turbo は音声1時間あたり約$0.04(30秒で約0.05円)。最低課金は1リクエスト10秒分。
 * 動画ファイル(投稿時にブラウザで720pへ変換済みの数MB)をそのまま渡す。音声だけの抜き出しは要らない。
 *
 * Whisperは無音・BGMだけの区間に「ご視聴ありがとうございました」のような定型文を幻覚で出すため、
 * 信頼度の低い区間と定型文は捨て、残りが無ければ「声なし」として扱う。
 */

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
/** Groqに渡せるファイルの上限(無料枠25MB)。超える動画は文字起こししない。 */
export const MAX_TRANSCRIBE_BYTES = 24 * 1024 * 1024;

export type Cue = { s: number; e: number; t: string };

export type Transcription = {
  /** Whisperが判定した言語名(japanese / english / chinese など)。 */
  language: string;
  cues: Cue[];
};

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
};

/** 無音・BGMで出がちな幻覚の定型文(正規化後に、これだけで成り立つ区間を捨てる)。 */
const HALLUCINATIONS = [
  "ご視聴ありがとうございました",
  "ご視聴ありがとうございます",
  "ご清聴ありがとうございました",
  "チャンネル登録お願いします",
  "チャンネル登録よろしくお願いします",
  "最後までご視聴いただきありがとうございました",
  "おやすみなさい",
  "thankyouforwatching",
  "thanksforwatching",
  "pleasesubscribe",
  "字幕",
  "ありがとうございました",
];

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s　、。,.!！?？「」『』~〜ー♪♫…・]/g, "");
}

function isHallucination(text: string): boolean {
  const n = normalize(text);
  if (n.length < 2) return true;
  return HALLUCINATIONS.some((h) => n === normalize(h));
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 信頼できる区間だけを字幕の1行(cue)にする。 */
export function segmentsToCues(segments: WhisperSegment[]): Cue[] {
  const cues: Cue[] = [];
  for (const seg of segments) {
    const text = seg.text?.trim() ?? "";
    if (!text || isHallucination(text)) continue;
    if ((seg.no_speech_prob ?? 0) > 0.6) continue;
    if ((seg.avg_logprob ?? 0) < -1.0) continue;
    if ((seg.compression_ratio ?? 0) > 2.4) continue;
    cues.push({ s: roundTenth(seg.start), e: roundTenth(Math.max(seg.end, seg.start + 0.8)), t: text });
  }
  return cues.slice(0, 40);
}

/** 動画を文字起こしする。声が無い/信頼できる区間が無ければ cues は空配列。 */
export async function transcribeVideo(videoBytes: Blob, fileName: string): Promise<Transcription> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY が設定されていません");

  const form = new FormData();
  form.append("file", videoBytes, fileName);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as { language?: string; segments?: WhisperSegment[] };
  return { language: (json.language ?? "").toLowerCase(), cues: segmentsToCues(json.segments ?? []) };
}
