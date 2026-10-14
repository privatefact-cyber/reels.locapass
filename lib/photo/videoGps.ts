/**
 * 動画ファイル(mp4 / mov)の撮影場所を読み取る。写真用のEXIF(exifr)では動画は読めないため、
 * 動画の管理情報(moovボックス)の中にあるISO 6709形式の位置文字列を直接探す。
 *  - iPhone(mov): com.apple.quicktime.location.ISO6709 → 例 "+35.6812+139.7671+012.345/"
 *  - Androidなどのmp4: udta/©xyz → 例 "+35.6812+139.7671/"
 * 位置が入っていない動画、webmなどは null(呼び出し側で住所入力に進む)。
 * ファイル全体は読まず、先頭から各ボックスの見出しだけをたどって moov だけを読む(大きな動画でも軽い)。
 */

const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const ISO6709 = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\//;

async function readBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** 先頭から各ボックスの見出し(サイズと種類)だけを読んで、moovの位置と大きさを探す。 */
async function findMoov(file: File): Promise<{ start: number; size: number } | null> {
  let offset = 0;
  for (let i = 0; i < 200 && offset < file.size; i++) {
    const head = await readBytes(file, offset, offset + 16);
    if (head.length < 8) return null;
    const view = new DataView(head.buffer);
    let size = view.getUint32(0);
    const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (size === 1) {
      if (head.length < 16) return null;
      size = Number(view.getBigUint64(8)); // 大きなファイル用の64bitサイズ
    } else if (size === 0) {
      size = file.size - offset; // ファイルの終わりまで
    }
    if (size < 8) return null;
    if (type === "moov") return { start: offset, size };
    offset += size;
  }
  return null;
}

export async function readVideoGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const moov = await findMoov(file);
    if (!moov || moov.size > MAX_MOOV_BYTES) return null;
    const bytes = await readBytes(file, moov.start, moov.start + moov.size);
    // バイト列を1文字1バイトの文字列にして、位置文字列(ASCII)を探す。
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const m = text.match(ISO6709);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (lat === 0 && lng === 0) return null; // 位置なしを0,0で入れる機種がある
    return { lat, lng };
  } catch {
    return null;
  }
}
