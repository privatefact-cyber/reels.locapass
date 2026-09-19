"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireRootAdmin } from "@/lib/admin/require-admin";

export type CreateShopState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; shopId: string; loginEmail: string; initialPassword: string };

export async function createShop(
  _prevState: CreateShopState,
  formData: FormData,
): Promise<CreateShopState> {
  await requireRootAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim();
  const plan = String(formData.get("plan") ?? "standard").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim();
  const passwordMode = String(formData.get("password_mode") ?? "auto");
  const manualPassword = String(formData.get("owner_password") ?? "").trim();

  if (!name) {
    return { status: "error", message: "店舗名は必須です" };
  }
  if (!ownerEmail) {
    return { status: "error", message: "店舗管理者用メールアドレスは必須です" };
  }
  if (passwordMode === "manual" && manualPassword.length < 6) {
    return { status: "error", message: "パスワードは6文字以上で入力してください" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("admin_provision_shop", {
      p_name: name,
      p_area: area,
      p_genre: genre,
      p_plan: plan,
      p_owner_email: ownerEmail,
      p_owner_password: passwordMode === "manual" ? manualPassword : undefined,
      p_address: address || undefined,
    })
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "店舗の発行に失敗しました" };
  }

  revalidatePath("/admin");
  return {
    status: "success",
    shopId: data.shop_id,
    loginEmail: data.login_email,
    initialPassword: data.initial_password,
  };
}

export type IssueLoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; loginEmail: string; initialPassword: string };

export async function issueShopLogin(
  shopId: string,
  _prevState: IssueLoginState,
  formData: FormData,
): Promise<IssueLoginState> {
  await requireRootAdmin();
  // 空欄なら店舗コード(例: 4sw7cg@shop.modella.local)から自動採番、埋まっていればそれを使う。
  // "@"を含まない入力(例: liric-roppongi)は、そのままローカル部として扱いドメインを補う。
  const raw = String(formData.get("login_id") ?? "").trim().toLowerCase();
  const customEmail = raw ? (raw.includes("@") ? raw : `${raw}@shop.modella.local`) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("admin_create_login_for_shop", { p_shop_id: shopId, p_email: customEmail ?? undefined })
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "ログインの発行に失敗しました" };
  }

  revalidatePath(`/admin/shops/${shopId}`);
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password };
}

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; loginEmail: string; newPassword: string };

// 既存ログインのパスワードを再発行する。店長のパスワードを勝手に変えることは絶対に
// あってはならないため、運営者が明示的にこのボタンを押した時だけ実行される独立したアクション。
// 代理ログイン(startImpersonation)とは無関係で、代理ログイン時に自動実行されることはない。
export async function resetShopLoginPassword(
  shopStaffId: string,
  _prevState: ResetPasswordState,
): Promise<ResetPasswordState> {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("admin_reset_shop_login_password", { p_shop_staff_id: shopStaffId })
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "パスワードの再発行に失敗しました" };
  }

  return { status: "success", loginEmail: data.login_email, newPassword: data.new_password };
}

// 運営者が自分自身のセッションのまま、対象店舗を代理閲覧・操作できるようにする。
// 店舗側のパスワードやログイン情報には一切触れない(admin_impersonationsに記録するだけ)。
export async function startImpersonation(shopId: string) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_start_impersonation", { p_shop_id: shopId });
  if (error) throw new Error(`代理ログインの開始に失敗しました: ${error.message}`);
  redirect("/dashboard/shop");
}

export async function stopImpersonation() {
  await requireRootAdmin();
  const supabase = await createClient();
  await supabase.rpc("admin_stop_impersonation");
  redirect("/admin");
}

/**
 * マップのカードで動画を流す「動画オプション」の切り替え(プランとは別の契約)。
 * shops.map_video_enabled はDBのトリガーで運営者以外は変更できないようにしてある。
 */
export async function setShopMapVideo(shopId: string, enabled: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({ map_video_enabled: enabled })
    .eq("id", shopId)
    .select("id");

  if (error) throw new Error(`動画オプションの変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("動画オプションの変更に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/shops/${shopId}`);
}

/**
 * トップページのFEATURED枠(提携店舗特集)の表示可否。データ(featured_rank・取り込んだ
 * 紹介文/料金)は消さず、表示だけを止める。RLSで運営者以外は更新できない(00077参照)。
 */
export async function setFeaturedSectionEnabled(enabled: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ featured_section_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");

  if (error) throw new Error(`FEATURED枠の設定変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("FEATURED枠の設定変更に失敗しました(権限をご確認ください)");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setShopStatus(shopId: string, status: "active" | "inactive") {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({ status })
    .eq("id", shopId)
    .select("id");

  if (error) throw new Error(`店舗の状態変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("店舗の状態変更に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/shops/${shopId}`);
}

/**
 * locapass_shops用の公開/非公開切り替え。site管理者は自分のportal_idの店舗のみ、
 * root管理者は全site操作可(requireAdminのportalIdsがnullかどうかで判定)。
 * DB側のRLS(locapass_is_portal_admin経由でroot管理者も許可)でも二重に保護されている。
 */
export async function setLocapassShopStatus(shopId: string, status: "active" | "inactive") {
  const scope = await requireAdmin();
  const supabase = await createClient();

  let query = supabase.from("locapass_shops").update({ status }).eq("id", shopId);
  if (scope.portalIds !== null) {
    query = query.in("portal_id", scope.portalIds);
  }
  const { data, error } = await query.select("id");

  if (error) throw new Error(`店舗の状態変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("店舗の状態変更に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePath("/admin");
}
