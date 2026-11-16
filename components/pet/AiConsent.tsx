"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { setPetAiConsent } from "@/app/pet/aiConsentActions";
import { PetCard, petButton } from "./ui";

/**
 * 外部のAI(Google Gemini)にデータを送ることへの同意(App Storeの審査ガイドライン5.1.2)。
 *  - ログイン中: 同意した日時をDB(locapass_pet_owner_settings.ai_consent_at)に保存。サーバー側でも確かめる。
 *  - ログインなし(AIコンシェルジュだけ): この端末のブラウザに保存する。
 * AIに送る機能は、送る前に ensure()(押した直後の処理が要るものは ensureNow())で、同意を確かめる。
 */
type Ctx = {
  granted: boolean;
  /** 同意がなければ画面を出し、同意されれば true を返す(同意しなければ false)。 */
  ensure: () => Promise<boolean>;
  /** 同意があれば true。なければ画面を出して false。同意されたら proceed を呼ぶ(ボタンを押した直後の処理を壊さないため、待たない)。 */
  ensureNow: (proceed?: () => void) => boolean;
  setGranted: (next: boolean) => Promise<boolean>;
};

const AiConsentContext = createContext<Ctx | null>(null);
const GUEST_KEY = "locawan_ai_consent_v1";

export function useAiConsent(): Ctx {
  const ctx = useContext(AiConsentContext);
  if (!ctx) throw new Error("AiConsentProvider がありません");
  return ctx;
}

export function AiConsentProvider({ initialGranted, loggedIn, children }: { initialGranted: boolean; loggedIn: boolean; children: ReactNode }) {
  const [granted, setGrantedState] = useState(initialGranted);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiters = useRef<((ok: boolean) => void)[]>([]);
  const afterGrant = useRef<(() => void)[]>([]);

  // ログインしていない人は、この端末に保存した同意を読む
  useEffect(() => {
    if (loggedIn) return;
    try {
      if (localStorage.getItem(GUEST_KEY) === "1") setGrantedState(true);
    } catch {
      // 保存領域が使えないときは、毎回確認する
    }
  }, [loggedIn]);

  const setGranted = useCallback(
    async (next: boolean) => {
      if (loggedIn) {
        const res = await setPetAiConsent(next);
        if (!res.ok) {
          setError(res.error ?? "保存できませんでした");
          return false;
        }
      } else {
        try {
          if (next) localStorage.setItem(GUEST_KEY, "1");
          else localStorage.removeItem(GUEST_KEY);
        } catch {
          // 保存できなくても、このページを開いている間は有効にする
        }
      }
      setGrantedState(next);
      return true;
    },
    [loggedIn],
  );

  const finish = useCallback((ok: boolean) => {
    setOpen(false);
    setError(null);
    for (const w of waiters.current.splice(0)) w(ok);
    const after = afterGrant.current.splice(0);
    if (ok) for (const f of after) f();
  }, []);

  const ensure = useCallback(() => {
    if (granted) return Promise.resolve(true);
    setOpen(true);
    return new Promise<boolean>((resolve) => waiters.current.push(resolve));
  }, [granted]);

  const ensureNow = useCallback(
    (proceed?: () => void) => {
      if (granted) return true;
      if (proceed) afterGrant.current.push(proceed);
      setOpen(true);
      return false;
    },
    [granted],
  );

  async function agree() {
    setBusy(true);
    setError(null);
    const ok = await setGranted(true);
    setBusy(false);
    if (ok) finish(true);
  }

  const value = useMemo<Ctx>(() => ({ granted, ensure, ensureNow, setGranted }), [granted, ensure, ensureNow, setGranted]);

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="AIの利用について">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-[#FFF7EC] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-[#4A3426] shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFEBDD] text-[#EE6A36]" aria-hidden>
                <Sparkles size={18} />
              </span>
              <h2 className="text-lg font-extrabold">AIの利用について</h2>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-[#7A6050]">
              ロカわんの次の機能では、外部のAIサービス(Googleの「Gemini」)に、あなたのデータを送って処理します。
            </p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed">
              <li className="rounded-2xl bg-white p-3">
                <b>書類の写真の読み取り</b>
                <br />
                撮影した書類(狂犬病の注射済票・ワクチン証明など)の画像を送り、種類・日付・病院名を読み取ります。
              </li>
              <li className="rounded-2xl bg-white p-3">
                <b>公開前の写真の確認</b>
                <br />
                ギャラリーや地図に公開する写真と、場所の名前を送り、犬が写っているか、住所のわかる情報が写っていないかを確かめます。
              </li>
              <li className="rounded-2xl bg-white p-3">
                <b>AIコンシェルジュ</b>
                <br />
                入力した質問と、現在地(許可した場合のみ)を送り、回答をつくります。
              </li>
            </ul>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-[#7A6050]">
              <li>送ったデータは、上の目的のためだけに使います。</li>
              <li>同意しなくても、手入力での記録など、AIを使わない機能はそのまま使えます(公開とAIコンシェルジュは、同意が必要です)。</li>
              <li>同意は、設定からいつでも取り消せます。</li>
              <li>
                くわしくは
                <a href="/privacy" className="font-bold underline" target="_blank" rel="noopener noreferrer">
                  プライバシーポリシー
                </a>
                をご覧ください。
              </li>
            </ul>
            {error && <p className="mt-3 text-sm font-bold text-[#D04848]">{error}</p>}
            <div className="mt-5 grid gap-2">
              <button type="button" className={`${petButton.primary} w-full`} onClick={agree} disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
                同意して続ける
              </button>
              <button type="button" className={`${petButton.ghost} w-full`} onClick={() => finish(false)} disabled={busy}>
                同意しない
              </button>
            </div>
          </div>
        </div>
      )}
    </AiConsentContext.Provider>
  );
}

/** 設定画面: AIへのデータ送信への同意の状態と、取り消し/同意 */
export function PetAiConsentSetting() {
  const { granted, setGranted } = useAiConsent();
  const [busy, setBusy] = useState(false);
  return (
    <PetCard className="mb-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          ✨
        </span>
        <span className="flex-1 text-sm">
          <b className="block">AIの利用への同意</b>
          <span className="text-xs text-[#9C8273]">
            {granted ? "同意しています(書類の読み取り・公開前の確認・コンシェルジュ)" : "同意していません。AIを使う機能の前に、あらためて確認します"}
          </span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await setGranted(!granted);
            setBusy(false);
          }}
          className={granted ? petButton.ghost : petButton.soft}
        >
          {busy ? "…" : granted ? "取り消す" : "同意する"}
        </button>
      </div>
    </PetCard>
  );
}
