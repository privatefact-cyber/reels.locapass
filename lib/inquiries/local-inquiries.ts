"use client";

// ログイン不要の問い合わせ機能用: 自分が送った問い合わせ(スレッドID)をブラウザに覚えさせておく。
// viewer-id.tsと同じ「認証は絡めないカジュアルな実装」方針。
const STORAGE_KEY = "modella_inquiries";

export interface LocalInquiry {
  inquiryId: string;
  shopId: string;
  shopName: string;
  createdAt: string;
}

export function listLocalInquiries(): LocalInquiry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalInquiry(inquiry: LocalInquiry) {
  if (typeof window === "undefined") return;
  const list = listLocalInquiries();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([inquiry, ...list]));
}
