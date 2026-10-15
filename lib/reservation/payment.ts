import { DEPOSIT_AMOUNT } from "./config";

/**
 * デポジットの仮決済(与信)の窓口。Stripeが審査中のため、いまは stub(状態遷移だけ、課金なし)で流れを動かす。
 * Stripe接続時は stripeProvider を実装して provider() の分岐を差し替えるだけで、呼び出し側(service.ts)は変えない。
 *
 * 【Stripe実装メモ】
 *  - authorize : Checkout Session(mode=payment, payment_intent_data.capture_method='manual', 1,000円)。
 *                完了(checkout.session.completed の webhook)で PaymentIntent の ID を payment_ref に保存。
 *                客がカードを入力するため、予約の作成は「Checkout完了後」に確定させる(いまの stub は即時)。
 *  - release   : paymentIntents.cancel(ref)  → 請求0円で枠を解放。
 *  - capture   : paymentIntents.capture(ref) → 売上確定。
 *  - 与信の保持は約7日(MAX_DAYS_AHEAD)。売上をお店へ入れるにはStripe Connect(店舗の連結アカウント)が必要。
 */
export type PaymentResult = { ok: true; ref: string } | { ok: false; error: string };

export interface PaymentProvider {
  name: "stub" | "stripe";
  authorize(input: { reservationKey: string; amount: number }): Promise<PaymentResult>;
  release(ref: string): Promise<PaymentResult>;
  capture(ref: string): Promise<PaymentResult>;
}

const stubProvider: PaymentProvider = {
  name: "stub",
  async authorize({ reservationKey }) {
    return { ok: true, ref: `stub_${reservationKey}` };
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

export { DEPOSIT_AMOUNT };
