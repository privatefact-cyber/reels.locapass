"use client";

/**
 * 【2026-11-07 方針変更】書類・明細の画像は非公開の置き場(サーバー)に保存する方式に戻した(機種変更・別端末でも見られるように)。
 * このファイルは、方針変更前に端末内へ保存された画像を読み出して置き場へ移すため(components/pet/LocalImage.tsx)に残している。
 *
 * 以前の方式: 書類(狂犬病・鑑札・ワクチン・ペット保険証)と通院明細の画像は、サーバーに送らず、この端末のブラウザ(IndexedDB)にだけ保存する。
 * サーバー(Supabase)には、端末内の画像を指す "local:<uuid>" という文字だけを保存する(画像そのものは送らない)。
 *
 * 注意: ブラウザのデータ消去・機種変更・(iPhoneのSafariで)長く開かなかった場合に消えることがある。
 * そのため保存時に navigator.storage.persist() を申請し、各画像に「端末に保存(書き出し)」を付ける。
 */
const DB_NAME = "locapass-pet";
const STORE = "images";
const VERSION = 1;
export const LOCAL_PREFIX = "local:";

type Rec = { id: string; blob: Blob; petId: string; kind: string; createdAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("この端末では画像を保存できません"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("petId", "petId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("端末の保存領域を開けませんでした"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function isLocalRef(ref: string | null | undefined): ref is string {
  return typeof ref === "string" && ref.startsWith(LOCAL_PREFIX);
}

/** ブラウザに「この保存データは消さないで」と申請する(許可されない端末もある) */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** 画像を端末に保存し、サーバーに保存する参照("local:<uuid>")を返す */
export async function saveLocalImage(blob: Blob, meta: { petId: string; kind: "document" | "medical" }): Promise<string> {
  const id = crypto.randomUUID();
  await tx("readwrite", (s) => s.put({ id, blob, petId: meta.petId, kind: meta.kind, createdAt: Date.now() } satisfies Rec));
  requestPersistentStorage().catch(() => undefined);
  return `${LOCAL_PREFIX}${id}`;
}

export async function getLocalImage(ref: string): Promise<Blob | null> {
  if (!isLocalRef(ref)) return null;
  try {
    const rec = (await tx("readonly", (s) => s.get(ref.slice(LOCAL_PREFIX.length)))) as Rec | undefined;
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteLocalImages(refs: (string | null | undefined)[]): Promise<void> {
  for (const ref of refs) {
    if (!isLocalRef(ref)) continue;
    await tx("readwrite", (s) => s.delete(ref.slice(LOCAL_PREFIX.length))).catch(() => undefined);
  }
}

/** うちの子を削除したとき、その子の端末内の画像もまとめて消す */
export async function deleteLocalImagesForPet(petId: string): Promise<void> {
  try {
    const keys = (await tx("readonly", (s) => s.index("petId").getAllKeys(petId))) as IDBValidKey[];
    for (const k of keys) await tx("readwrite", (s) => s.delete(k)).catch(() => undefined);
  } catch {
    // 端末に保存領域がない場合は何もしない
  }
}
