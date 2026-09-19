"use server";

import type { ApplyImportInput, ApplyImportResult, PreviewImportResult } from "@/app/dashboard/shop/importActions";

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

// スタッフ管理
export type InviteStaffState =
  | { status: "idle" }
  | { status: "success"; loginEmail: string; initialPassword: string }
  | { status: "error"; message: string };

export async function addStaffMember(_formData: FormData) {
  fail();
}
export async function deleteStaffMember(_staffMemberId: string) {
  fail();
}
export async function inviteStaff(_staffMemberId: string, _prevState: InviteStaffState): Promise<InviteStaffState> {
  return { status: "error", message: NOT_CONNECTED };
}
export async function regenerateStaffLoginToken(_staffMemberId: string) {
  fail();
}

// キャスト管理
export async function addCast(_formData: FormData) {
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
