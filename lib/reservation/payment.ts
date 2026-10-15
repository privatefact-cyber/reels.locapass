import type { PaymentMethod } from "./config";

/**
 * デポジットの窓口。Stripeが審査中のため、いまは stub(状態遷移だけ、課金なし)で流れを動かす。
 * Stripe接続時は stripeProvider を実装し、paymentProvider() の分岐を差し替えるだけ(service.ts は変えない)。
 *
 * 【方針】Locapass(親アカウント)が一括で受領し、没収分はお店ごとの台帳→月額利用料の請求から控除する。
 *        店舗ごとのStripeアカウント(Connect)も、お店への振込も使わない。通常来店は決済が発生せず手数料0円。
 *
 * 【Stripe実装メモ】
 *  - secure (method='hold')  : PaymentIntent(capture_method='manual', 3DS必須)を作り、与信を確保。ref=PaymentIntent ID。
 *  - secure (method='save')  : SetupIntent(usage='off_session', 3DS必須)でカードを保存。ref=PaymentMethod ID(+Customer)。
 *                              登録時に payment_method.card.funding==='prepaid' は拒否。fingerprint を返して
 *                              過去に没収・請求失敗のあるカードは弾く(SecureResult.fingerprint)。
 *  - release                 : hold=paymentIntents.cancel / save=何もしない(必要なら detach)。請求0円・手数料なし。
 *  - capture                 : hold=paymentIntents.capture / save=off_session で PaymentIntent を作成して請求。
 *                              失敗(残高不足・認証要求・解約)は {ok:false} で返す → 予約は no_show のまま payment_status='failed'。
 *  - Checkout の完了(webhook)後に予約を確定させる(いまの stub は即時)。
 */
export type SecureResult = { ok: true; ref: string; fingerprint?: string | null } | { ok: false; error: string };
export type PaymentResult = { ok: true; ref: string } | { ok: false; error: string };

export interface PaymentProvider {
  name: "stub" | "stripe";
  secure(input: { reservationKey: string; amount: number; method: PaymentMethod }): Promise<SecureResult>;
  release(ref: string, method: PaymentMethod): Promise<PaymentResult>;
  capture(ref: string, method: PaymentMethod, amount: number): Promise<PaymentResult>;
}

const stubProvider: PaymentProvider = {
  name: "stub",
  async secure({ reservationKey, method }) {
    return { ok: true, ref: `stub_${method}_${reservationKey}`, fingerprint: null };
  },
  async release(ref) {
    return { ok: true, ref };
  },
  async capture(ref) {
    return { ok: true, ref };
  },
};

export function paymentProvider(): PaymentProvider {
  // if (process.env.STRIPE_SECRET_KEY) return stripeProvider;  // ← Stripe審査通過後に実装
  return stubProvider;
}
