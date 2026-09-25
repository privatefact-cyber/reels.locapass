"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeCategory } from "@/lib/shop/locapassCategories";
import { requireAdmin, requireRootAdmin } from "@/lib/admin/require-admin";
import { isSiteTheme, type SiteTheme } from "@/lib/theme";

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

export async function updatePortalBranding(
  portalId: number,
  input: {
    name: string;
    tagline: string;
    description: string;
    heroMediaType: "image" | "video";
    heroMediaUrl: string | null;
    heroLinkUrl: string | null;
    /** このポータルの配色テーマ。null はサイト全体の設定に従う */
    theme: SiteTheme | null;
  },
) {
  await requirePortalAccess(portalId);
  if (input.theme !== null && !isSiteTheme(input.theme)) throw new Error("不明な配色テーマです");
  if (input.heroLinkUrl && !(/^(https?:\/\/|\/|#)/i.test(input.heroLinkUrl))) {
    throw new Error("リンク先は https://、/、# から始まるURLを入力してください");
  }
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("locapass_portals")
    .update({
      name: input.name.trim(),
      tagline: input.tagline.trim() || null,
      description: input.description.trim() || null,
      hero_media_type: input.heroMediaType,
      hero_media_url: input.heroMediaUrl,
      hero_link_url: input.heroLinkUrl?.trim() || null,
      theme: input.theme,
    })
    .eq("id", portalId)
    .select("slug");
  if (error) throw new Error(`ポータル設定の保存に失敗しました: ${error.message}`);
  if (!updated || updated.length === 0) throw new Error("ポータル設定の保存に失敗しました(権限をご確認ください)");
  revalidatePortal(portalId);
  if (updated[0].slug) revalidatePath(`/${updated[0].slug}`);
  // 所属店舗の店舗ページにも配色テーマが効くので、店舗ページもまとめて再生成する
  revalidatePath("/shops/[shopId]", "page");
}

/**
 * 店舗を別の子ポータルへ移動する(ルート管理者のみ)。店舗情報・写真・パートナー・店舗管理者はそのまま。
 * 業種も同時に選び直せる(null なら変更しない)。その店舗のリールの所属ポータルも付け替える
 * (locapass_reels のトリガーが更新時に店舗の portal_id を写す)。
 */
export async function moveShopToPortal(shopId: string, toPortalId: number, category: string | null) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data: before } = await supabase.from("locapass_shops").select("portal_id").eq("id", shopId).maybeSingle();
  if (!before) throw new Error("店舗が見つかりません");
  const patch: { portal_id: number; category?: string | null } = { portal_id: toPortalId };
  if (category !== null) patch.category = normalizeCategory(category);
  const { data: moved, error } = await supabase.from("locapass_shops").update(patch).eq("id", shopId).select("id");
  if (error) throw new Error(`店舗の移動に失敗しました: ${error.message}`);
  if (!moved || moved.length === 0) throw new Error("店舗の移動に失敗しました(権限をご確認ください)");

  const { error: reelError } = await supabase
    .from("locapass_reels")
    .update({ updated_at: new Date().toISOString() })
    .eq("shop_id", shopId);
  if (reelError) throw new Error(`店舗は移動しましたが、リールの付け替えに失敗しました: ${reelError.message}`);

  for (const id of [before.portal_id, toPortalId]) {
    if (id !== null) revalidatePortal(id);
  }
  const { data: slugs } = await supabase.from("locapass_portals").select("slug").in("id", [before.portal_id, toPortalId].filter((v): v is number => v !== null));
  for (const p of slugs ?? []) if (p.slug) revalidatePath(`/${p.slug}`);
  revalidatePath(`/shops/${shopId}`);
  revalidatePath("/admin");
}

export type CreatePortalState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      portalId: number;
      name: string;
      adminEmail: string;
      initialPassword: string | null;
      adminError: string | null;
    };

export async function createPortal(_prev: CreatePortalState, formData: FormData): Promise<CreatePortalState> {
  await requireRootAdmin();
  const name = String(formData.get("portal_name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  if (!name) return { status: "error", message: "ポータル名は必須です" };
  if (!slug) return { status: "error", message: "スラッグは必須です" };
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    return { status: "error", message: "スラッグは半角英小文字・数字・ハイフンで2〜41文字にしてください" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return { status: "error", message: "管理者メールアドレスの形式が正しくありません" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locapass_create_portal", {
    p_slug: slug,
    p_name: name,
  });
  if (error || data == null) {
    const message = error?.message.includes("locapass_portals_slug_key")
      ? "このスラッグは既に使われています"
      : (error?.message ?? "ポータルの発行に失敗しました");
    return { status: "error", message };
  }

  const { data: admin, error: adminError } = await supabase
    .rpc("locapass_grant_portal_admin", { p_portal_id: data, p_email: adminEmail })
    .single();

  revalidatePath("/admin/portals");
  return {
    status: "success",
    portalId: data,
    name,
    adminEmail,
    initialPassword: admin?.initial_password ?? null,
    adminError: adminError?.message ?? null,
  };
}

export type UpdatePortalNameState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; name: string };

export async function updatePortalName(
  portalId: number,
  _prev: UpdatePortalNameState,
  formData: FormData,
): Promise<UpdatePortalNameState> {
  await requireRootAdmin();
  const name = String(formData.get("portal_name") ?? "").trim();
  if (!name) return { status: "error", message: "ポータル名は必須です" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("locapass_portals")
    .update({ name })
    .eq("id", portalId);
  if (error) return { status: "error", message: error.message };

  revalidatePortal(portalId);
  return { status: "success", name };
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
    p_category: normalizeCategory(String(formData.get("category") ?? "")) ?? undefined,
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

/**
 * コンシェルジュの「街の声 β」タブ(locapass用)の表示可否。スーパー管理者のみ。
 * platform_settings はLUXELAと共通のテーブルなので、locapass用の列だけをRPC経由で切り替える(00099)。
 */
export async function setMachiNoKoeBetaEnabled(enabled: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_set_machi_no_koe_beta", { p_enabled: enabled });
  if (error) throw new Error(`街の声ベータ版の設定変更に失敗しました: ${error.message}`);
  revalidatePath("/admin");
}

/** locapass のサイト全体の配色テーマ。null は自動(12/1〜12/25はクリスマス、それ以外は通常)。LUXELAとは別に切り替わる。 */
export async function setSiteTheme(theme: SiteTheme | null) {
  await requireRootAdmin();
  if (theme !== null && !isSiteTheme(theme)) throw new Error("不明な配色テーマです");
  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_set_site_theme", { p_theme: theme });
  if (error) throw new Error(`配色テーマの変更に失敗しました: ${error.message}`);
  // 公開サイト全体(ルートレイアウト)に即時反映する
  revalidatePath("/", "layout");
}
