"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireRootAdmin } from "@/lib/admin/require-admin";

/**
 * ポータル/店舗の発行・権限付与チェーン。
 *   super_admin  : ポータル発行、portal_admin の付与・解除
 *   portal_admin : 配下の店舗発行・削除、shop_admin の付与・解除・パスワード再発行
 * 権限判定は画面側(requireAdmin の portalIds)に加え、DB側のRPC(locapass_is_super_admin /
 * locapass_is_portal_admin)でも必ず行われる。
 */

/** ログイン中の管理者がこのポータルを担当しているか(super_admin は全ポータル)。 */
async function requirePortalAccess(portalId: number) {
  const scope = await requireAdmin();
  if (scope.portalIds !== null && !scope.portalIds.includes(portalId)) {
    throw new Error("このポータルを操作する権限がありません");
  }
  return scope;
}

function revalidatePortal(portalId: number) {
  revalidatePath("/admin/portals");
  revalidatePath(`/admin/portals/${portalId}`);
  revalidatePath("/admin");
}

export type CreatePortalState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; portalId: number; name: string };

export async function createPortal(_prev: CreatePortalState, formData: FormData): Promise<CreatePortalState> {
  await requireRootAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const homeUrl = String(formData.get("home_url") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  if (!name) return { status: "error", message: "ポータル名は必須です" };
  if (!slug) return { status: "error", message: "スラッグは必須です" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locapass_create_portal", {
    p_slug: slug,
    p_name: name,
    p_home_url: homeUrl || undefined,
    p_tagline: tagline || undefined,
  });
  if (error || data == null) {
    const message = error?.message.includes("locapass_portals_slug_key")
      ? "このスラッグは既に使われています"
      : (error?.message ?? "ポータルの発行に失敗しました");
    return { status: "error", message };
  }

  revalidatePath("/admin/portals");
  return { status: "success", portalId: data, name };
}

export type IssuedLoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  /** initialPassword が null のときは既存アカウントに権限だけ付与した(パスワードは本人のまま)。 */
  | { status: "success"; loginEmail: string; initialPassword: string | null };

export async function grantPortalAdmin(
  portalId: number,
  _prev: IssuedLoginState,
  formData: FormData,
): Promise<IssuedLoginState> {
  await requireRootAdmin();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "メールアドレスを入力してください" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("locapass_grant_portal_admin", { p_portal_id: portalId, p_email: email })
    .single();
  if (error || !data) return { status: "error", message: error?.message ?? "権限の付与に失敗しました" };

  revalidatePortal(portalId);
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password ?? null };
}

export async function revokePortalAdmin(portalId: number, userId: string) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_revoke_portal_admin", { p_portal_id: portalId, p_user_id: userId });
  if (error) throw new Error(`権限の解除に失敗しました: ${error.message}`);
  revalidatePortal(portalId);
}

export type CreateShopState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      shopId: string;
      shopName: string;
      login: { loginEmail: string; initialPassword: string | null } | null;
      loginError: string | null;
    };

/** 配下に店舗を発行する。「shop_admin ログインも発行」にチェックがあれば同時に付与する。 */
export async function createPortalShop(_prev: CreateShopState, formData: FormData): Promise<CreateShopState> {
  const portalId = Number(formData.get("portal_id"));
  if (!Number.isFinite(portalId) || portalId <= 0) return { status: "error", message: "ポータルを選択してください" };
  await requirePortalAccess(portalId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "店舗名は必須です" };
  const issueLogin = formData.get("issue_login") === "on";
  const adminEmail = String(formData.get("admin_email") ?? "").trim();

  const supabase = await createClient();
  const { data: shopId, error } = await supabase.rpc("locapass_create_shop", {
    p_portal_id: portalId,
    p_name: name,
    p_category: String(formData.get("category") ?? "").trim() || undefined,
    p_address: String(formData.get("address") ?? "").trim() || undefined,
    p_tel: String(formData.get("tel") ?? "").trim() || undefined,
  });
  if (error || !shopId) return { status: "error", message: error?.message ?? "店舗の発行に失敗しました" };

  // 店舗自体は作れたので、ログイン発行に失敗しても店舗発行は成功として返し、エラーだけ併記する。
  let login: { loginEmail: string; initialPassword: string | null } | null = null;
  let loginError: string | null = null;
  if (issueLogin) {
    const { data, error: loginErr } = await supabase
      .rpc("locapass_grant_shop_admin", { p_shop_id: shopId, p_email: adminEmail || undefined })
      .single();
    if (loginErr || !data) {
      loginError = loginErr?.message ?? "ログインの発行に失敗しました";
    } else {
      login = { loginEmail: data.login_email, initialPassword: data.initial_password ?? null };
    }
  }

  revalidatePortal(portalId);
  return { status: "success", shopId, shopName: name, login, loginError };
}

export async function grantShopAdmin(
  portalId: number,
  shopId: string,
  _prev: IssuedLoginState,
  formData: FormData,
): Promise<IssuedLoginState> {
  await requirePortalAccess(portalId);
  const email = String(formData.get("email") ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("locapass_grant_shop_admin", { p_shop_id: shopId, p_email: email || undefined })
    .single();
  if (error || !data) return { status: "error", message: error?.message ?? "ログインの発行に失敗しました" };

  revalidatePortal(portalId);
  return { status: "success", loginEmail: data.login_email, initialPassword: data.initial_password ?? null };
}

export async function revokeShopAdmin(portalId: number, shopAdminId: string) {
  await requirePortalAccess(portalId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_revoke_shop_admin", { p_shop_admin_id: shopAdminId });
  if (error) throw new Error(`権限の解除に失敗しました: ${error.message}`);
  revalidatePortal(portalId);
}

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; loginEmail: string; newPassword: string };

export async function resetShopAdminPassword(
  portalId: number,
  shopAdminId: string,
  _prev: ResetPasswordState,
): Promise<ResetPasswordState> {
  await requirePortalAccess(portalId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("locapass_reset_shop_admin_password", { p_shop_admin_id: shopAdminId })
    .single();
  if (error || !data) return { status: "error", message: error?.message ?? "パスワードの再発行に失敗しました" };
  return { status: "success", loginEmail: data.login_email, newPassword: data.new_password };
}

/** 店舗の削除(リール・shop_admin 等の紐づくデータも一緒に消える)。portal_admin 以上のみ(RLSでも制限)。 */
export async function deletePortalShop(portalId: number, shopId: string) {
  await requirePortalAccess(portalId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locapass_shops")
    .delete()
    .eq("id", shopId)
    .eq("portal_id", portalId)
    .select("id");
  if (error) throw new Error(`店舗の削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("店舗の削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidatePortal(portalId);
}

/**
 * マップのカードで動画を流す「動画オプション」の切り替え(本家 setShopMapVideo。プランとは別の契約)。
 * locapass_shops.map_video_enabled はDBのトリガーで portal_admin 以上しか変更できない。
 */
export async function setShopMapVideo(portalId: number, shopId: string, enabled: boolean) {
  await requirePortalAccess(portalId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locapass_shops")
    .update({ map_video_enabled: enabled })
    .eq("id", shopId)
    .eq("portal_id", portalId)
    .select("id");

  if (error) throw new Error(`動画オプションの変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("動画オプションの変更に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePortal(portalId);
  revalidatePath("/map");
}
