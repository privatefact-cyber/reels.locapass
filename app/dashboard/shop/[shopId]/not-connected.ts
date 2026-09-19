"use server";

import type { ApplyImportInput, ApplyImportResult, PreviewImportResult } from "@/lib/shop/importTypes";

/**
 * LUXELA本家の店舗管理画面にある機能のうち、locapass側にまだ受け皿のテーブルが無いもの。
 * 画面(UI)は本家と同じものを出すが、LUXELAのデータを共有しないためDBには一切書き込まず、
 * 実行されたら「未接続」であることをそのまま伝える。locapass側のテーブルを用意したら
 * ここを本家のactionsと同じ実装に差し替える。
 */
const NOT_CONNECTED = "この機能はまだlocapassのデータベースに接続されていません";

function fail(): never {
  throw new Error(NOT_CONNECTED);
}

// 店舗情報: 料金表・本日の出勤
export async function addPriceItem(_formData: FormData) {
  fail();
}
export async function deletePriceItem(_itemId: string) {
  fail();
}
export async function upsertTodaySchedule(
  _castId: string,
  _scheduleId: string | null,
  _date: string,
  _formData: FormData,
) {
  fail();
}

// 店舗情報: イベント(locapass_shop_eventsは閲覧のみ接続済み。書き込み経路はまだ無い)
export async function addEvent(_formData: FormData) {
  fail();
}
export async function deleteEvent(_eventId: string) {
  fail();
}

// 店舗情報: 公式サイトから取り込み
export async function previewImportAction(_url: string): Promise<PreviewImportResult> {
  return { ok: false, error: NOT_CONNECTED };
}
export async function applyImportAction(_input: ApplyImportInput): Promise<ApplyImportResult> {
  return { ok: false, error: NOT_CONNECTED };
}

// リール投稿: マップのカード動画
export async function setMapPreviewReel(_reelId: string | null) {
  fail();
}

// 応募者管理
export async function addApplicant(_formData: FormData) {
  fail();
}

// お客様へのメッセージ
export async function sendShopMessage(_formData: FormData) {
  fail();
}

// キャスト詳細: 写真・出勤・リール・コメント(locapassに受け皿が無い)
export async function deletePhoto(_castId: string, _mediaId: string) {
  fail();
}
export async function addSchedule(_castId: string, _formData: FormData) {
  fail();
}
export async function deleteSchedule(_castId: string, _scheduleId: string) {
  fail();
}
export async function deleteCastReel(_castId: string, _reelId: string) {
  fail();
}
export async function deleteCastReelComment(_castId: string, _commentId: string) {
  fail();
}
